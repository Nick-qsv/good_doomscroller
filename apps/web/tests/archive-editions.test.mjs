import { describe, expect, it } from "vitest";

import {
  archiveEditionIds,
  parseRetirementArguments,
  validateRetirementMarker,
} from "../scripts/archive-editions-lib.mjs";

const EDITION_ID = "22222222-2222-5222-8222-222222222222";

describe("edition retirement markers", () => {
  it("derives the edition UUID only from an empty, strictly named marker", () => {
    expect(
      validateRetirementMarker(`/corpus/retired/${EDITION_ID}.retired`, Buffer.alloc(0)),
    ).toBe(EDITION_ID);
    expect(() =>
      validateRetirementMarker(`/corpus/retired/${EDITION_ID}.retired`, "notes"),
    ).toThrow(/must be an empty file/);
    expect(() =>
      validateRetirementMarker("/corpus/retired/book.retired", Buffer.alloc(0)),
    ).toThrow(/edition-uuid/);
  });

  it("accepts marker paths and rejects unknown flags", () => {
    expect(parseRetirementArguments([`${EDITION_ID}.retired`])).toEqual({
      help: false,
      paths: [`${EDITION_ID}.retired`],
    });
    expect(() => parseRetirementArguments([])).toThrow(/at least one/);
    expect(() => parseRetirementArguments(["--delete"])).toThrow(/Unknown option/);
  });

  it("archives passages while retaining and marking the edition", async () => {
    const calls = [];
    const transaction = (strings, ...values) => {
      const text = strings.join("?");
      calls.push({ text, values });
      if (text.includes("SELECT id")) return Promise.resolve([{ id: EDITION_ID }]);
      if (text.includes("UPDATE passages")) return Promise.resolve([{ id: "passage" }]);
      if (text.includes("UPDATE editions")) return Promise.resolve([{ id: EDITION_ID }]);
      return Promise.resolve([]);
    };
    const sql = { begin: async (callback) => callback(transaction) };

    const totals = await archiveEditionIds(sql, [EDITION_ID, EDITION_ID]);

    expect(totals).toEqual({
      markers: 1,
      editionsMarked: 1,
      passagesArchived: 1,
    });
    expect(calls).toHaveLength(3);
    expect(calls.every((call) => call.values.includes(EDITION_ID))).toBe(true);
    expect(calls[1].text).toContain("status = 'archived'");
    expect(calls[2].text).toContain("'retired', true");
  });

  it("fails closed when a valid-looking marker matches no edition", async () => {
    const transaction = (strings) =>
      Promise.resolve(strings.join("?").includes("SELECT id") ? [] : []);
    const sql = { begin: async (callback) => callback(transaction) };

    await expect(archiveEditionIds(sql, [EDITION_ID])).rejects.toThrow(
      /does not match an existing edition/,
    );
  });
});
