#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import process from "node:process";

import { createDatabaseClient } from "./database-config.mjs";
import {
  archiveEditionIds,
  parseRetirementArguments,
  validateRetirementMarker,
} from "./archive-editions-lib.mjs";
import { resolveInputPath } from "./import-corpus-lib.mjs";

const usage = `Usage: npm run corpus:retire -- <edition-uuid>.retired [...]

Each marker must be an empty file named for an edition UUID. A permanent
retirement is recorded even if the edition has never been imported. Existing
edition evidence is retained while all of its passages become unpublished.
`;

async function main() {
  const options = parseRetirementArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage);
    return;
  }

  const editionIds = await Promise.all(
    options.paths.map(async (path) => {
      const absolutePath = resolveInputPath(path);
      let contents;
      try {
        contents = await readFile(absolutePath);
      } catch (error) {
        throw new Error(`${absolutePath}: could not read marker: ${error.message}`);
      }
      return validateRetirementMarker(absolutePath, contents);
    }),
  );

  const sql = createDatabaseClient();
  try {
    const totals = await archiveEditionIds(sql, editionIds);
    process.stdout.write(
      `Processed ${totals.markers} retirement marker(s); marked ` +
        `${totals.editionsMarked} edition(s) and archived ` +
        `${totals.passagesArchived} passage(s).\n`,
    );
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  process.stderr.write(`Edition retirement failed: ${error.message}\n`);
  process.exitCode = 1;
});
