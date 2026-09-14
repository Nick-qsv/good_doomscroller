import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildEnvelope, createMerkleTree, POLKADOT_GENESIS_HASH, POLKADOT_SIGNER_ADDRESS, sha256, receiptRationale, parseEnvelope } from "./proofs.mjs";
import { validateProofBundle, verifyProofBundle } from "./verify-proof.mjs";

const passageId = "a73cc6ee-f313-440b-a5f8-84ff7fd8db56";
const batchId = "1436dc8e-3357-4a0d-8d5d-bfd38d7e5ea4";

function fixture(version = 1) {
  const first = JSON.stringify({ schemaVersion: "1.0", passageId, previousReceiptSha256: null, recordedAt: "2026-01-01T00:00:00Z", selection: { reason: "A clear account of curiosity and learning 🌟." } });
  const second = JSON.stringify({ schemaVersion: "1.0", passageId, previousReceiptSha256: sha256(first), recordedAt: "2026-01-02T00:00:00Z", selection: { reason: "Learning through observation.", selectionRecordedAt: "2026-01-02T00:00:00Z" } });
  const history = [first, second].map((receiptJson) => ({ receiptJson, receiptSha256: sha256(receiptJson) }));
  const tree = createMerkleTree(history.map((entry, index) => ({ sequence: String(index + 1), receiptSha256: entry.receiptSha256 })));
  const batch = {
    batchId, previousBatchId: null, previousRootSha256: null, rootSha256: tree.rootSha256,
    receiptCount: 2, firstReceiptSequence: "1", lastReceiptSequence: "2",
    envelopeHex: buildEnvelope({ batchId, receiptCount: 2, rootSha256: tree.rootSha256, previousRootSha256: null,
      ...(version === 2 ? { rationaleEntries: history.map(receiptRationale) } : {}) }),
    genesisHash: POLKADOT_GENESIS_HASH, signerAddress: POLKADOT_SIGNER_ADDRESS,
    blockHash: "0x" + "a".repeat(64), blockNumber: "20577500", blockTimestamp: "2026-09-12T22:00:00Z",
    extrinsicHash: "0x" + "b".repeat(64), extrinsicIndex: 2, eventIndex: 4, finalizedHeadHash: "0x" + "c".repeat(64),
  };
  return {
    schemaVersion: "1.0", receiptJson: second, receiptSha256: sha256(second), receipt: JSON.parse(second), history,
    anchoring: {
      status: "finalized", totalReceipts: 2, finalizedReceipts: 2, pendingReceipts: 0,
      history: history.map((entry, index) => ({ sequence: String(index + 1), receiptSha256: entry.receiptSha256, status: "finalized", batchId, inclusionProof: tree.proofs[index] })),
      batches: [batch],
    },
  };
}

function chainFor(bundle, edits = {}) {
  const calls = [];
  return {
    calls,
    async verifyFinalizedCommitment(request) {
      calls.push(request);
      const batch = bundle.anchoring.batches.find((entry) => entry.blockHash === request.blockHash);
      assert.ok(batch);
      return {
        status: "finalized", ...batch, payloadHex: batch.envelopeHex,
        // A later independent check naturally observes a newer finalized head.
        finalizedHeadHash: "0x" + "d".repeat(64), ...edits,
      };
    },
  };
}

test("verifies each receipt against one independently read finalized batch", async () => {
  const bundle = fixture();
  const chain = chainFor(bundle);
  const result = await verifyProofBundle(bundle, { chain });
  assert.equal(result.status, "verified");
  assert.equal(result.verifiedReceipts, 2);
  assert.equal(result.pendingReceipts, 0);
  assert.equal(chain.calls.length, 1);
  assert.equal(chain.calls[0].payloadHex, bundle.anchoring.batches[0].envelopeHex);
  assert.equal(result.verifiedBatches[0].finalizedHeadHash, "0x" + "d".repeat(64));
  assert.match(result.trustNote, /RPC-based verification; use an independently chosen node/);
  assert.match(result.trustNote, /not a GRANDPA light-client/);
  assert.match(result.trustNote, /do not authenticate earlier claimed dates/);
});

test("pending earlier history cannot become a fully verified label because the latest receipt is anchored", async () => {
  const bundle = fixture();
  bundle.anchoring.history[0] = { sequence: "1", receiptSha256: bundle.history[0].receiptSha256, status: "pending" };
  Object.assign(bundle.anchoring, { status: "partial", finalizedReceipts: 1, pendingReceipts: 1 });
  const chain = chainFor(bundle);
  const result = await verifyProofBundle(bundle, { chain });
  assert.equal(result.status, "pending");
  assert.equal(result.verifiedReceipts, 1);
  assert.equal(result.pendingReceipts, 1);
  assert.equal(chain.calls.length, 1);
});

test("entirely pending history has no RPC requirement and makes no finality claim", async () => {
  const bundle = fixture();
  bundle.anchoring.history = bundle.anchoring.history.map(({ sequence, receiptSha256 }) => ({ sequence, receiptSha256, status: "pending" }));
  Object.assign(bundle.anchoring, { status: "pending", finalizedReceipts: 0, pendingReceipts: 2, batches: [] });
  const result = await verifyProofBundle(bundle);
  assert.equal(result.status, "pending");
  assert.equal(result.verifiedReceipts, 0);
  assert.deepEqual(result.verifiedBatches, []);
});

test("CLI returns an explicit non-success exit for pending or invalid proof files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gds-proof-verifier-"));
  try {
    const path = join(directory, "proof.json");
    const bundle = fixture();
    bundle.anchoring.history = bundle.anchoring.history.map(({ sequence, receiptSha256 }) => ({ sequence, receiptSha256, status: "pending" }));
    Object.assign(bundle.anchoring, { status: "pending", finalizedReceipts: 0, pendingReceipts: 2, batches: [] });
    await writeFile(path, JSON.stringify(bundle));
    const script = fileURLToPath(new URL("./verify-proof.mjs", import.meta.url));
    const pending = spawnSync(process.execPath, [script, path], { encoding: "utf8", timeout: 10_000 });
    assert.equal(pending.status, 2);
    assert.equal(JSON.parse(pending.stdout).pendingReceipts, 2);
    assert.equal(pending.stderr, "");
    bundle.receiptJson += " ";
    await writeFile(path, JSON.stringify(bundle));
    const invalid = spawnSync(process.execPath, [script, path], { encoding: "utf8", timeout: 10_000 });
    assert.equal(invalid.status, 1);
    assert.equal(invalid.stdout, "");
    assert.match(invalid.stderr, /Latest receipt fingerprint mismatch/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects altered bytes, incomplete history, forged coverage and malformed commitments before RPC", async () => {
  const mutations = [
    (bundle) => { bundle.history[0].receiptJson += " "; },
    (bundle) => { bundle.receipt.recordedAt = "1900-01-01T00:00:00Z"; },
    (bundle) => { bundle.history.shift(); bundle.anchoring.history.shift(); Object.assign(bundle.anchoring, { totalReceipts: 1, finalizedReceipts: 1 }); },
    (bundle) => { bundle.anchoring.history.shift(); },
    (bundle) => { bundle.anchoring.history.reverse(); },
    (bundle) => { bundle.anchoring.totalReceipts = 3; },
    (bundle) => { bundle.anchoring.pendingReceipts = 1; },
    (bundle) => { bundle.anchoring.history[0].status = "pending"; },
    (bundle) => { bundle.anchoring.batches[0].genesisHash = "0x" + "0".repeat(64); },
    (bundle) => { bundle.anchoring.batches[0].signerAddress = "another signer"; },
    (bundle) => { bundle.anchoring.batches[0].envelopeHex = "0x" + "0".repeat(184); },
    (bundle) => { bundle.anchoring.batches[0].receiptCount = 3; },
    (bundle) => { bundle.anchoring.history[0].inclusionProof.siblings[0].sha256 = "0".repeat(64); },
    (bundle) => { bundle.anchoring.history[0].inclusionProof.leafIndex = 1; },
    (bundle) => { bundle.anchoring.batches[0].previousBatchId = batchId; },
    (bundle) => { bundle.anchoring.batches[0].previousRootSha256 = "0".repeat(64); },
    (bundle) => { bundle.anchoring.batches.push(bundle.anchoring.batches[0]); },
  ];
  for (const mutate of mutations) {
    const bundle = fixture();
    const chain = chainFor(bundle);
    mutate(bundle);
    await assert.rejects(verifyProofBundle(bundle, { chain }));
    assert.equal(chain.calls.length, 0);
  }
});

test("rejects success labels when the actual finalized block, timestamp, event or transaction differs", async () => {
  const changes = [
    { status: "failed" }, { status: "pending" },
    { blockTimestamp: "2026-09-12T22:01:00Z" }, { eventIndex: 5 }, { extrinsicIndex: 3 },
    { blockNumber: "20577501" }, { blockHash: "0x" + "0".repeat(64) },
    { extrinsicHash: "0x" + "0".repeat(64) }, { payloadHex: "0x00" },
    { signerAddress: "another signer" }, { genesisHash: "0x" + "0".repeat(64) },
    { finalizedHeadHash: null },
  ];
  for (const change of changes) {
    const bundle = fixture();
    const chain = chainFor(bundle, change);
    await assert.rejects(verifyProofBundle(bundle, { chain }), /Live finalized-chain evidence/);
    assert.equal(chain.calls.length, 1);
  }
  await assert.rejects(verifyProofBundle(fixture(), { chain: { async verifyFinalizedCommitment() { throw new Error("Noncanonical block"); } } }), /Noncanonical block/);
  await assert.rejects(verifyProofBundle(fixture()), /chain reader is required/);
});

test("states when preceding global batches are absent instead of claiming complete batch continuity", async () => {
  const bundle = fixture();
  const batch = bundle.anchoring.batches[0];
  batch.previousBatchId = "1436dc8e-3357-4a0d-8d5d-bfd38d7e5ea5";
  batch.previousRootSha256 = "f".repeat(64);
  batch.envelopeHex = buildEnvelope(batch);
  const result = await verifyProofBundle(bundle, { chain: chainFor(bundle) });
  assert.equal(result.status, "verified");
  assert.equal(result.batchContinuity, "predecessors-not-supplied");
  assert.deepEqual(result.missingPredecessorBatchIds, [batch.previousBatchId]);
  assert.equal(validateProofBundle(bundle).finalizedReceipts, 2);
});

test("checks included predecessor identity, root and chronological order", async () => {
  function linkedFixture() {
    const bundle = fixture();
    const original = bundle.anchoring.batches[0];
    bundle.anchoring.batches = bundle.history.map((receipt, index) => {
      const tree = createMerkleTree([{ sequence: String(index + 1), receiptSha256: receipt.receiptSha256 }]);
      const batch = {
        ...original, batchId: index ? "1436dc8e-3357-4a0d-8d5d-bfd38d7e5ea5" : batchId,
        rootSha256: tree.rootSha256, receiptCount: 1, firstReceiptSequence: String(index + 1), lastReceiptSequence: String(index + 1),
        blockHash: "0x" + (index ? "f" : "a").repeat(64), blockNumber: String(20577500 + index),
      };
      bundle.anchoring.history[index].batchId = batch.batchId;
      bundle.anchoring.history[index].inclusionProof = tree.proofs[0];
      return batch;
    });
    const [first, second] = bundle.anchoring.batches;
    second.previousBatchId = first.batchId;
    second.previousRootSha256 = first.rootSha256;
    for (const batch of bundle.anchoring.batches) batch.envelopeHex = buildEnvelope(batch);
    return bundle;
  }
  const valid = linkedFixture();
  const chain = chainFor(valid);
  assert.equal((await verifyProofBundle(valid, { chain })).batchContinuity, "supplied-predecessor-links-match");
  assert.equal(chain.calls.length, 2);
  for (const change of [
    { previousRootSha256: "e".repeat(64) },
    { previousBatchId: "1436dc8e-3357-4a0d-8d5d-bfd38d7e5ea6" },
    { blockNumber: "20577499" },
  ]) {
    const invalid = linkedFixture();
    Object.assign(invalid.anchoring.batches[1], change);
    invalid.anchoring.batches[1].envelopeHex = buildEnvelope(invalid.anchoring.batches[1]);
    assert.throws(() => validateProofBundle(invalid), /Previous batch/);
  }
});

test("v2 independent chain verification checks the actual readable reason bytes against exact receipts", async () => {
  const bundle = fixture(2);
  const chain = chainFor(bundle);
  assert.equal((await verifyProofBundle(bundle, { chain })).status, "verified");
  const envelope = parseEnvelope(chain.calls[0].payloadHex);
  assert.equal(envelope.version, 2);
  assert.deepEqual(envelope.rationaleEntries, bundle.history.map(receiptRationale));
  assert.equal(Object.hasOwn(envelope.rationaleEntries[0].selection, "selectionRecordedAt"), false);
});

test("valid v2 framing and Merkle hashes cannot conceal a substituted public rationale or invented timestamp", async () => {
  for (const change of [
    entry => { entry.selection.reason = "A different reason."; },
    entry => { entry.selection.selectionRecordedAt = "1900-01-01T00:00:00Z"; },
    entry => { entry.passageId = "a73cc6ee-f313-440b-a5f8-84ff7fd8db57"; },
  ]) {
    const bundle = fixture(2);
    const batch = bundle.anchoring.batches[0];
    const envelope = parseEnvelope(batch.envelopeHex);
    change(envelope.rationaleEntries[0]);
    batch.envelopeHex = buildEnvelope(envelope);
    const chain = chainFor(bundle);
    await assert.rejects(verifyProofBundle(bundle, { chain }), /rationale differs/);
    assert.equal(chain.calls.length, 0);
  }
});

test("a different actual on-chain rationale fails even when downloaded rationale and receipt match", async () => {
  const bundle = fixture(2);
  const envelope = parseEnvelope(bundle.anchoring.batches[0].envelopeHex);
  envelope.rationaleEntries[0].selection.reason = "Different text actually submitted.";
  const chain = chainFor(bundle, { payloadHex: buildEnvelope(envelope) });
  await assert.rejects(verifyProofBundle(bundle, { chain }), /Live finalized-chain evidence/);
  assert.equal(chain.calls.length, 1);
});
