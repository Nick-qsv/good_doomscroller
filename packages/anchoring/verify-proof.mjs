import { readFile, stat } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";
import {
  buildEnvelope, POLKADOT_GENESIS_HASH, POLKADOT_SIGNER_ADDRESS,
  sha256, verifyReceiptProof, parseEnvelope, receiptRationale,
} from "./proofs.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const CHAIN_HASH = /^0x[0-9a-f]{64}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const NONNEGATIVE_INTEGER = /^(0|[1-9][0-9]*)$/;
const TRUST_NOTE = "RPC-based verification; use an independently chosen node. This is not a GRANDPA light-client finality proof. Source normalization must be checked separately. Anchors do not authenticate earlier claimed dates, book attribution, human review, completeness of logged events, or whether this is the newest available history.";

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function positiveSequence(value) {
  return typeof value === "string" && POSITIVE_INTEGER.test(value) && BigInt(value) <= 9223372036854775807n;
}

function checkBatch(batch) {
  ensure(batch && UUID.test(batch.batchId), "Invalid batch identity");
  ensure(batch.previousBatchId === null || UUID.test(batch.previousBatchId), "Invalid previous batch identity");
  ensure((batch.previousBatchId === null) === (batch.previousRootSha256 === null), "Previous batch and root must both be present or absent");
  ensure(batch.previousBatchId !== batch.batchId, "A batch cannot precede itself");
  ensure(batch.previousRootSha256 === null || SHA256.test(batch.previousRootSha256), "Invalid previous batch root");
  ensure(batch.genesisHash === POLKADOT_GENESIS_HASH && batch.signerAddress === POLKADOT_SIGNER_ADDRESS, "Unexpected chain or signer");
  const envelope = parseEnvelope(batch.envelopeHex);
  ensure(buildEnvelope({ ...batch, rationaleEntries: envelope.rationaleEntries }) === batch.envelopeHex, "Batch envelope does not match its declared commitment");
  ensure(positiveSequence(batch.firstReceiptSequence) && positiveSequence(batch.lastReceiptSequence) &&
    BigInt(batch.firstReceiptSequence) <= BigInt(batch.lastReceiptSequence), "Invalid batch receipt range");
  ensure(CHAIN_HASH.test(batch.blockHash) && CHAIN_HASH.test(batch.extrinsicHash) && CHAIN_HASH.test(batch.finalizedHeadHash), "Invalid chain evidence hash");
  ensure(typeof batch.blockNumber === "string" && NONNEGATIVE_INTEGER.test(batch.blockNumber) && BigInt(batch.blockNumber) <= BigInt(Number.MAX_SAFE_INTEGER), "Invalid block number");
  ensure(Number.isSafeInteger(batch.extrinsicIndex) && batch.extrinsicIndex >= 0 && Number.isSafeInteger(batch.eventIndex) && batch.eventIndex >= 0, "Invalid chain evidence index");
  ensure(typeof batch.blockTimestamp === "string" && Number.isFinite(new Date(batch.blockTimestamp).getTime()), "Invalid block timestamp");
}

// Validate everything that can be checked offline before connecting to any RPC.
// Site labels and claimed coverage counts are never used as proof of inclusion.
export function validateProofBundle(bundle) {
  ensure(bundle?.schemaVersion === "1.0", "Unsupported proof schema");
  ensure(typeof bundle.receiptJson === "string" && SHA256.test(bundle.receiptSha256) &&
    sha256(bundle.receiptJson) === bundle.receiptSha256, "Latest receipt fingerprint mismatch");
  const latest = JSON.parse(bundle.receiptJson);
  ensure(isDeepStrictEqual(latest, bundle.receipt), "Parsed latest receipt differs from the exact receipt JSON");
  ensure(UUID.test(latest.passageId), "Invalid passage identity");
  ensure(Array.isArray(bundle.history) && bundle.history.length > 0 && bundle.history.length <= 100_000, "Missing or excessive receipt history");
  let previous = null;
  const receiptHashes = new Set();
  for (const entry of bundle.history) {
    ensure(typeof entry?.receiptJson === "string" && SHA256.test(entry.receiptSha256) && sha256(entry.receiptJson) === entry.receiptSha256, "History receipt fingerprint mismatch");
    const receipt = JSON.parse(entry.receiptJson);
    ensure(receipt.schemaVersion === "1.0" && receipt.passageId === latest.passageId && receipt.previousReceiptSha256 === previous, "Receipt history link or passage mismatch");
    ensure(!receiptHashes.has(entry.receiptSha256), "Duplicate history receipt");
    receiptHashes.add(entry.receiptSha256);
    previous = entry.receiptSha256;
  }
  ensure(previous === bundle.receiptSha256 && bundle.history.at(-1).receiptJson === bundle.receiptJson, "Latest receipt does not end the supplied history");

  const anchoring = bundle.anchoring;
  ensure(anchoring && Array.isArray(anchoring.history) && anchoring.history.length === bundle.history.length &&
    Array.isArray(anchoring.batches) && anchoring.batches.length <= bundle.history.length, "Missing or inconsistent anchoring coverage");
  const batches = new Map();
  for (const batch of anchoring.batches) {
    checkBatch(batch);
    ensure(!batches.has(batch.batchId), "Duplicate batch identity");
    batches.set(batch.batchId, batch);
  }
  let priorSequence = 0n;
  let pendingReceipts = 0;
  const usedBatches = new Set();
  const usedLeaves = new Set();
  const priorBatchLeaf = new Map();
  anchoring.history.forEach((entry, index) => {
    ensure(entry?.receiptSha256 === bundle.history[index].receiptSha256 && positiveSequence(entry.sequence) && BigInt(entry.sequence) > priorSequence, "Anchoring map does not match the complete ordered receipt history");
    priorSequence = BigInt(entry.sequence);
    if (entry.status === "pending") {
      ensure(entry.batchId === undefined && entry.inclusionProof === undefined, "A pending receipt must not claim finalized inclusion");
      pendingReceipts += 1;
      return;
    }
    ensure(entry.status === "finalized", "Unknown receipt anchoring status");
    const batch = batches.get(entry.batchId);
    ensure(batch && entry.inclusionProof?.leafCount === batch.receiptCount &&
      BigInt(entry.sequence) >= BigInt(batch.firstReceiptSequence) && BigInt(entry.sequence) <= BigInt(batch.lastReceiptSequence) &&
      verifyReceiptProof(entry.receiptSha256, entry.inclusionProof, batch.rootSha256), "Receipt inclusion proof does not match its batch");
    const envelope = parseEnvelope(batch.envelopeHex);
    if (envelope.version === 2) {
      ensure(isDeepStrictEqual(envelope.rationaleEntries[entry.inclusionProof.leafIndex], receiptRationale(bundle.history[index])),
        "On-chain public rationale differs from the exact receipt selection");
    }
    const leafKey = `${entry.batchId}:${entry.inclusionProof.leafIndex}`;
    ensure(!usedLeaves.has(leafKey), "Duplicate claimed leaf position");
    ensure(entry.inclusionProof.leafIndex > (priorBatchLeaf.get(entry.batchId) ?? -1), "Receipt sequence order contradicts its batch leaf order");
    priorBatchLeaf.set(entry.batchId, entry.inclusionProof.leafIndex);
    usedLeaves.add(leafKey);
    usedBatches.add(entry.batchId);
  });
  ensure(usedBatches.size === batches.size, "Bundle contains batches unused by its history receipts");
  const finalizedReceipts = bundle.history.length - pendingReceipts;
  const expectedStatus = pendingReceipts === 0 ? "finalized" : finalizedReceipts === 0 ? "pending" : "partial";
  ensure(anchoring.totalReceipts === bundle.history.length && anchoring.finalizedReceipts === finalizedReceipts &&
    anchoring.pendingReceipts === pendingReceipts && anchoring.status === expectedStatus, "Claimed anchoring coverage is inaccurate");

  const missingPredecessors = new Set();
  for (const batch of batches.values()) {
    if (batch.previousBatchId === null) continue;
    const predecessor = batches.get(batch.previousBatchId);
    if (!predecessor) {
      ensure(![...batches.values()].some((candidate) => candidate.rootSha256 === batch.previousRootSha256), "Previous batch identity contradicts a supplied predecessor root");
      missingPredecessors.add(batch.previousBatchId);
      continue;
    }
    ensure(predecessor.rootSha256 === batch.previousRootSha256 && BigInt(predecessor.blockNumber) < BigInt(batch.blockNumber), "Previous batch metadata does not match its supplied predecessor");
  }
  return {
    passageId: latest.passageId, totalReceipts: bundle.history.length, finalizedReceipts, pendingReceipts,
    batches: [...batches.values()], missingPredecessors: [...missingPredecessors],
  };
}

// The adapter only reads public chain data. The CLI never prepares or signs a
// transaction and does not read the application's database or wallet material.
export async function verifyProofBundle(bundle, { chain } = {}) {
  const checked = validateProofBundle(bundle);
  ensure(checked.batches.length === 0 || typeof chain?.verifyFinalizedCommitment === "function", "A chain reader is required for finalized claims");
  const verifiedBatches = [];
  for (const batch of checked.batches) {
    const actual = await chain.verifyFinalizedCommitment({
      blockHash: batch.blockHash, extrinsicHash: batch.extrinsicHash, extrinsicIndex: batch.extrinsicIndex,
      payloadHex: batch.envelopeHex, signerAddress: POLKADOT_SIGNER_ADDRESS,
    });
    ensure(actual?.status === "finalized" && actual.genesisHash === POLKADOT_GENESIS_HASH && actual.signerAddress === POLKADOT_SIGNER_ADDRESS &&
      actual.payloadHex === batch.envelopeHex && actual.blockHash === batch.blockHash && String(actual.blockNumber) === batch.blockNumber &&
      actual.extrinsicHash === batch.extrinsicHash && actual.extrinsicIndex === batch.extrinsicIndex && actual.eventIndex === batch.eventIndex &&
      new Date(actual.blockTimestamp).getTime() === new Date(batch.blockTimestamp).getTime() && CHAIN_HASH.test(actual.finalizedHeadHash),
    "Live finalized-chain evidence does not match the downloaded batch claims");
    verifiedBatches.push({
      batchId: batch.batchId, blockHash: actual.blockHash, blockNumber: String(actual.blockNumber),
      blockTimestamp: actual.blockTimestamp, extrinsicHash: actual.extrinsicHash, extrinsicIndex: actual.extrinsicIndex,
      eventIndex: actual.eventIndex, finalizedHeadHash: actual.finalizedHeadHash,
    });
  }
  return {
    status: checked.pendingReceipts === 0 ? "verified" : "pending",
    passageId: checked.passageId, totalReceipts: checked.totalReceipts,
    verifiedReceipts: checked.finalizedReceipts, pendingReceipts: checked.pendingReceipts,
    genesisHash: POLKADOT_GENESIS_HASH, signerAddress: POLKADOT_SIGNER_ADDRESS,
    verifiedBatches,
    batchContinuity: checked.missingPredecessors.length ? "predecessors-not-supplied" : "supplied-predecessor-links-match",
    missingPredecessorBatchIds: checked.missingPredecessors,
    trustNote: TRUST_NOTE,
  };
}

export async function main(args = process.argv.slice(2)) {
  ensure(args.length === 1 || (args.length === 3 && args[1] === "--rpc"), "Usage: node packages/anchoring/verify-proof.mjs <proof.json> [--rpc wss://your-trusted-rpc]");
  let endpoint;
  if (args[1] === "--rpc") {
    const url = new URL(args[2]);
    ensure(url.protocol === "wss:" && !url.username && !url.password && !url.hash, "RPC must be a secure WebSocket URL without embedded credentials or a fragment");
    endpoint = url.toString();
  }
  ensure((await stat(args[0])).size <= 64 * 1024 * 1024, "Proof file exceeds the 64 MiB limit");
  const bundle = JSON.parse(await readFile(args[0], "utf8"));
  const checked = validateProofBundle(bundle);
  let chain;
  try {
    if (checked.batches.length) {
      const { createChainClient } = await import("./chain.mjs");
      chain = await createChainClient({ ...(endpoint ? { rpcEndpoints: [endpoint] } : {}), genesisHash: POLKADOT_GENESIS_HASH, signerAddress: POLKADOT_SIGNER_ADDRESS });
    }
    const result = await verifyProofBundle(bundle, { chain });
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return result.status === "verified" ? 0 : 2;
  } finally {
    await chain?.disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    process.stderr.write(`Proof verification failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
