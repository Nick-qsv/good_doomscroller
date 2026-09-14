import assert from "node:assert/strict";
import test from "node:test";
import { buildEnvelope, buildManifest, createMerkleTree, sha256, verifyReceiptProof,
  receiptRationale, parseEnvelope, MAX_ANCHOR_PAYLOAD_BYTES } from "./proofs.mjs";

const batchId = "01234567-89ab-cdef-0123-456789abcdef";
const receipts = [
  { sequence: "9007199254740993", receiptSha256: "33".repeat(32) },
  { sequence: "10", receiptSha256: "22".repeat(32) },
  { sequence: "1", receiptSha256: "11".repeat(32) },
];

test("independent three-leaf vector uses domain separation, BIGINT ordering and odd duplication", () => {
  const tree = createMerkleTree(receipts);
  // Expected digests independently calculated with Python hashlib.
  assert.equal(tree.rootSha256, "4118b0b8b03727613a79962aa22cb29474c01378848625423390a5b36e6735a0");
  assert.deepEqual(tree.receipts.map((receipt) => receipt.sequence), ["1", "10", "9007199254740993"]);
  assert.deepEqual(tree.proofs[2], { leafIndex: 2, leafCount: 3, siblings: [
    { side: "right", sha256: "5e5caeafc27155c368b6f201107d6f8b270747ce636ac5174a56c6e12ef89ad1" },
    { side: "left", sha256: "cc15b132263fd4fd2748c0e7cb9e1c4ad0afe70fcf9382ee644c4da8af0286a5" },
  ] });
  tree.receipts.forEach((receipt, index) => assert.equal(verifyReceiptProof(receipt.receiptSha256, tree.proofs[index], tree.rootSha256), true));
});

test("single receipt and even/odd trees verify; edited bytes, root, path and direction fail", () => {
  for (let length = 1; length <= 33; length++) {
    const entries = Array.from({ length }, (_, index) => ({ sequence: String(index + 1), receiptSha256: sha256(`receipt ${index} 🌟`) }));
    const tree = createMerkleTree(entries);
    entries.forEach((entry, index) => {
      const proof = tree.proofs[index];
      assert.equal(verifyReceiptProof(entry.receiptSha256, proof, tree.rootSha256), true);
      assert.equal(verifyReceiptProof(sha256("edited receipt"), proof, tree.rootSha256), false);
      assert.equal(verifyReceiptProof(entry.receiptSha256, proof, "0".repeat(64)), false);
      assert.equal(verifyReceiptProof(entry.receiptSha256, { ...proof, leafIndex: length }, tree.rootSha256), false);
      assert.equal(verifyReceiptProof(entry.receiptSha256, { ...proof, siblings: [...proof.siblings, { side: "left", sha256: entry.receiptSha256 }] }, tree.rootSha256), false);
      if (proof.siblings.length) {
        const edited = structuredClone(proof);
        edited.siblings[0].side = edited.siblings[0].side === "left" ? "right" : "left";
        assert.equal(verifyReceiptProof(entry.receiptSha256, edited, tree.rootSha256), false);
        assert.equal(verifyReceiptProof(entry.receiptSha256, { ...proof, siblings: proof.siblings.slice(1) }, tree.rootSha256), false);
      }
    });
  }
  assert.equal(verifyReceiptProof("zz".repeat(32), { leafIndex: 0, leafCount: 1, siblings: [] }, "0".repeat(64)), false);
});

test("envelope is exactly 92 bytes and commits UUID, count, root and previous root", () => {
  const rootSha256 = createMerkleTree(receipts).rootSha256;
  const envelope = buildEnvelope({ batchId, receiptCount: 3, rootSha256, previousRootSha256: null });
  assert.equal(envelope, `0x474453414e4348310123456789abcdef0123456789abcdef00000003${rootSha256}${"0".repeat(64)}`);
  assert.equal(Buffer.from(envelope.slice(2), "hex").length, 92);
  assert.notEqual(buildEnvelope({ batchId, receiptCount: 4, rootSha256, previousRootSha256: null }), envelope);
  assert.notEqual(buildEnvelope({ batchId, receiptCount: 3, rootSha256, previousRootSha256: "1".repeat(64) }), envelope);
});

test("manifest serialization is deterministic and invalid/duplicate receipts are rejected", () => {
  const input = { batchId, previousBatchId: null, previousRootSha256: null, receipts };
  assert.equal(buildManifest(input), buildManifest({ ...input, receipts: [...receipts].reverse() }));
  assert.equal(JSON.parse(buildManifest(input)).receipts[0].sequence, "1");
  assert.throws(() => createMerkleTree([]));
  assert.throws(() => createMerkleTree([receipts[0], receipts[0]]));
  assert.throws(() => createMerkleTree([{ ...receipts[0], sequence: "01" }]));
  assert.throws(() => createMerkleTree([{ ...receipts[0], sequence: "9223372036854775808" }]));
  assert.throws(() => createMerkleTree([{ ...receipts[0], sequence: 1 }]));
  assert.throws(() => buildManifest({ ...input, previousRootSha256: "0".repeat(64) }));
});

const passageId = "a73cc6ee-f313-440b-a5f8-84ff7fd8db56";
function rationaleFixture(count = 2, reason = "Learning through curiosity: café, 世界 and 🌟.") {
  const exact = Array.from({ length: count }, (_, index) => {
    const receiptJson = JSON.stringify({ schemaVersion: "1.0", passageId, index, recordedAt: "2026-09-13T00:00:00Z",
      selection: { reason, ...(index ? { selectionRecordedAt: "2026-09-12T21:33:12.123456+00:00" } : {}), method: "manual" } });
    return { sequence: String(index + 1), receiptJson, receiptSha256: sha256(receiptJson) };
  });
  const rationaleEntries = exact.map(receiptRationale);
  const fields = { batchId, receiptCount: count, rootSha256: createMerkleTree(exact).rootSha256, previousRootSha256: null, rationaleEntries };
  return { exact, fields, envelope: buildEnvelope(fields) };
}
function replaceRationaleJson(envelope, json) {
  const bytes = Buffer.from(envelope.slice(2), "hex").subarray(0, 96);
  const body = Buffer.isBuffer(json) ? json : Buffer.from(json, "utf8");
  bytes.writeUInt32BE(body.length, 92);
  return "0x" + Buffer.concat([bytes, body]).toString("hex");
}

test("v2 carries canonical UTF-8 public explanations bound to receipt leaf order without inventing dates", () => {
  const { fields, envelope } = rationaleFixture();
  const bytes = Buffer.from(envelope.slice(2), "hex");
  assert.equal(bytes.subarray(0, 8).toString(), "GDSANCH2");
  assert.equal(bytes.readUInt32BE(92), bytes.subarray(96).length);
  assert.notEqual(bytes.readUInt32BE(92), bytes.subarray(96).toString().length);
  assert.equal(bytes.subarray(96).toString(), JSON.stringify(fields.rationaleEntries));
  assert.deepEqual(parseEnvelope(envelope), { version: 2, ...fields });
  assert.deepEqual(Object.keys(fields.rationaleEntries[0].selection), ["reason"]);
  assert.equal(fields.rationaleEntries[1].selection.selectionRecordedAt, "2026-09-12T21:33:12.123456+00:00");
  assert.equal(parseEnvelope(buildEnvelope({ ...fields, rationaleEntries: undefined })).version, 1);
  assert.throws(() => buildEnvelope({ ...fields, rationaleEntries: [...fields.rationaleEntries].reverse() }), /root mismatch/);
  assert.throws(() => buildEnvelope({ ...fields, receiptCount: 3 }), /count/);
});

test("v2 parser rejects noncanonical JSON, extra keys, duplicate keys, malformed UTF-8 and incorrect lengths", () => {
  const { fields, envelope } = rationaleFixture();
  const json = JSON.stringify(fields.rationaleEntries);
  const invalid = [
    replaceRationaleJson(envelope, json + " "),
    replaceRationaleJson(envelope, JSON.stringify(fields.rationaleEntries, null, 2)),
    replaceRationaleJson(envelope, json.replace('"receiptSha256":', '"unknown":1,"receiptSha256":')),
    replaceRationaleJson(envelope, json.replace('"passageId":', '"passageId":"discarded","passageId":')),
    replaceRationaleJson(envelope, json.replace("café", "caf\\u00e9")),
    replaceRationaleJson(envelope, Buffer.concat([Buffer.from(json), Buffer.from([0xc3, 0x28])])),
    envelope + "00", envelope.slice(0, -2), envelope.toUpperCase(),
  ];
  for (const value of invalid) assert.throws(() => parseEnvelope(value));
  const wrongLength = Buffer.from(envelope.slice(2), "hex"); wrongLength.writeUInt32BE(1, 92);
  assert.throws(() => parseEnvelope("0x" + wrongLength.toString("hex")), /byte length/);
  const wrongRoot = Buffer.from(envelope.slice(2), "hex"); wrongRoot[28] ^= 1;
  assert.throws(() => parseEnvelope("0x" + wrongRoot.toString("hex")), /root mismatch/);
});

test("receipt rationale extraction rejects tampered exact bytes, absent reason, invalid Unicode and oversized payloads", () => {
  const { exact } = rationaleFixture();
  assert.throws(() => receiptRationale({ ...exact[0], receiptJson: exact[0].receiptJson + " " }), /fingerprint/);
  for (const selection of [{}, { reason: "" }, { reason: "\ud800" }, { reason: "x".repeat(8193) },
    { reason: "Reason", selectionRecordedAt: null }, { reason: "Reason", selectionRecordedAt: "yesterday" }]) {
    const receiptJson = JSON.stringify({ schemaVersion: "1.0", passageId, selection });
    assert.throws(() => receiptRationale({ receiptJson, receiptSha256: sha256(receiptJson) }));
  }
  assert.throws(() => rationaleFixture(20, "a".repeat(8192)), /128 KiB/);
  assert.throws(() => parseEnvelope("0x" + "00".repeat(MAX_ANCHOR_PAYLOAD_BYTES + 1)), /excessive/);
});
