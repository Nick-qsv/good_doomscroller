import assert from "node:assert/strict";
import test from "node:test";
import { buildEnvelope, buildManifest, createMerkleTree, sha256, verifyReceiptProof } from "./proofs.mjs";

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
