import { createHash } from "node:crypto";

export const POLKADOT_GENESIS_HASH = "0x68d56f15f85d3136970ec16946040bc1752654e906147f7e43e9d539d7c3de2f";
export const POLKADOT_SIGNER_ADDRESS = "12wmbcz2PqfsLdJHhpn12bbkR1Az1ydkEsoJDxkSjCm8Ue59";
const SHA256 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const MAX_ANCHOR_PAYLOAD_BYTES = 128 * 1024;
export const MAX_RATIONALE_REASON_BYTES = 8192;
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function hashBytes(value) {
  if (typeof value !== "string" || !SHA256.test(value)) throw new Error("Invalid SHA-256 fingerprint");
  return Buffer.from(value, "hex");
}

function leafHash(receiptSha256) {
  return sha256(Buffer.concat([Buffer.from([0]), hashBytes(receiptSha256)]));
}

function parentHash(left, right) {
  return sha256(Buffer.concat([Buffer.from([1]), hashBytes(left), hashBytes(right)]));
}

export function orderedReceipts(receipts) {
  if (!Array.isArray(receipts) || receipts.length === 0 || receipts.length > 100_000) {
    throw new Error("A batch must contain between 1 and 100000 receipts");
  }
  const ordered = receipts.map(({ sequence, receiptSha256 }) => {
    if (typeof sequence !== "string" || !/^[1-9][0-9]*$/.test(sequence) || BigInt(sequence) > 9223372036854775807n) {
      throw new Error("Receipt sequence must be a canonical positive PostgreSQL BIGINT string");
    }
    hashBytes(receiptSha256);
    return { sequence, receiptSha256 };
  }).sort((left, right) => BigInt(left.sequence) < BigInt(right.sequence) ? -1 : 1);
  if (new Set(ordered.map((receipt) => receipt.sequence)).size !== ordered.length ||
      new Set(ordered.map((receipt) => receipt.receiptSha256)).size !== ordered.length) {
    throw new Error("Duplicate receipt sequence or fingerprint");
  }
  return ordered;
}

export function createMerkleTree(receipts) {
  const ordered = orderedReceipts(receipts);
  const levels = [ordered.map((receipt) => leafHash(receipt.receiptSha256))];
  while (levels.at(-1).length > 1) {
    const level = levels.at(-1);
    const next = [];
    for (let index = 0; index < level.length; index += 2) {
      next.push(parentHash(level[index], level[index + 1] ?? level[index]));
    }
    levels.push(next);
  }
  return {
    rootSha256: levels.at(-1)[0],
    receipts: ordered,
    proofs: ordered.map((_, leafIndex) => {
      let index = leafIndex;
      const siblings = levels.slice(0, -1).map((level) => {
        const side = index % 2 ? "left" : "right";
        const sibling = { side, sha256: level[index ^ 1] ?? level[index] };
        index = Math.floor(index / 2);
        return sibling;
      });
      return { leafIndex, leafCount: ordered.length, siblings };
    }),
  };
}

// Validate path shape as well as its hashes. Missing/extra siblings, impossible
// directions, and malformed odd-node duplication must not produce a valid proof.
export function verifyReceiptProof(receiptSha256, proof, rootSha256) {
  try {
    hashBytes(rootSha256);
    let current = leafHash(receiptSha256);
    if (!proof || !Number.isSafeInteger(proof.leafCount) || proof.leafCount < 1 || proof.leafCount > 100_000 ||
        !Number.isSafeInteger(proof.leafIndex) || proof.leafIndex < 0 || proof.leafIndex >= proof.leafCount ||
        !Array.isArray(proof.siblings)) return false;
    let index = proof.leafIndex;
    let width = proof.leafCount;
    let depth = 0;
    while (width > 1) {
      const sibling = proof.siblings[depth++];
      const side = index % 2 ? "left" : "right";
      if (!sibling || sibling.side !== side) return false;
      hashBytes(sibling.sha256);
      if (index % 2 === 0 && index + 1 === width && sibling.sha256 !== current) return false;
      current = side === "left" ? parentHash(sibling.sha256, current) : parentHash(current, sibling.sha256);
      index = Math.floor(index / 2);
      width = Math.ceil(width / 2);
    }
    return depth === proof.siblings.length && current === rootSha256;
  } catch {
    return false;
  }
}

function rationaleEntry(value) {
  if (!value || !UUID.test(value.passageId)) throw new Error("Invalid rationale passage UUID");
  hashBytes(value.receiptSha256);
  const reason = value.selection?.reason;
  if (typeof reason !== "string" || !reason.trim() || !reason.isWellFormed() ||
      Buffer.byteLength(reason, "utf8") > MAX_RATIONALE_REASON_BYTES) throw new Error("Invalid or excessive public selection reason");
  const selection = { reason };
  if (Object.hasOwn(value.selection, "selectionRecordedAt")) {
    const time = value.selection.selectionRecordedAt;
    if (typeof time !== "string" || time.length > 64 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(time) ||
        !Number.isFinite(Date.parse(time))) throw new Error("Invalid selection recording time");
    selection.selectionRecordedAt = time;
  }
  return { receiptSha256: value.receiptSha256, passageId: value.passageId, selection };
}

// Read only the public explanation from the exact hash-checked receipt. No
// timestamp is substituted from publication, the worker clock or old metadata.
export function receiptRationale({ receiptJson, receiptSha256 }) {
  if (typeof receiptJson !== "string" || !receiptJson.isWellFormed() || sha256(receiptJson) !== receiptSha256) {
    throw new Error("Rationale receipt fingerprint mismatch");
  }
  const receipt = JSON.parse(receiptJson);
  if (receipt.schemaVersion !== "1.0") throw new Error("Unsupported rationale receipt schema");
  return rationaleEntry({ receiptSha256, passageId: receipt.passageId, selection: receipt.selection });
}

export function canonicalRationaleJson(entries) {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 100_000) throw new Error("Invalid rationale count");
  const normalized = entries.map(rationaleEntry);
  if (new Set(normalized.map(entry => entry.receiptSha256)).size !== normalized.length) throw new Error("Duplicate rationale receipt");
  return JSON.stringify(normalized);
}

export function buildEnvelope({ batchId, receiptCount, rootSha256, previousRootSha256, rationaleEntries }) {
  if (typeof batchId !== "string" || !UUID.test(batchId)) throw new Error("Invalid canonical batch UUID");
  if (!Number.isSafeInteger(receiptCount) || receiptCount < 1 || receiptCount > 100_000) throw new Error("Invalid receipt count");
  const count = Buffer.alloc(4);
  count.writeUInt32BE(receiptCount);
  const header = Buffer.concat([
    Buffer.from(rationaleEntries === undefined ? "GDSANCH1" : "GDSANCH2", "ascii"), Buffer.from(batchId.replaceAll("-", ""), "hex"), count,
    hashBytes(rootSha256), previousRootSha256 === null ? Buffer.alloc(32) : hashBytes(previousRootSha256),
  ]);
  if (rationaleEntries === undefined) return "0x" + header.toString("hex");
  const json = Buffer.from(canonicalRationaleJson(rationaleEntries), "utf8");
  if (rationaleEntries.length !== receiptCount) throw new Error("Rationale count does not match commitment");
  const tree = createMerkleTree(rationaleEntries.map((entry, index) => ({ sequence: String(index + 1), receiptSha256: entry.receiptSha256 })));
  if (tree.rootSha256 !== rootSha256) throw new Error("Rationale receipt order or root mismatch");
  if (96 + json.length > MAX_ANCHOR_PAYLOAD_BYTES) throw new Error("Anchor payload exceeds 128 KiB limit");
  const length = Buffer.alloc(4); length.writeUInt32BE(json.length);
  return "0x" + Buffer.concat([header, length, json]).toString("hex");
}

// V2 canonical JSON is an ordered array in Merkle leaf order, with exactly these
// property orders: receiptSha256, passageId, selection; reason, optional time.
// Round-trip equality rejects whitespace, duplicate/unknown keys, alternate
// escapes, malformed UTF-8, trailing bytes, and a misleading length prefix.
export function parseEnvelope(envelopeHex) {
  if (typeof envelopeHex !== "string" || !/^0x(?:[0-9a-f]{2})+$/.test(envelopeHex) ||
      envelopeHex.length > 2 + MAX_ANCHOR_PAYLOAD_BYTES * 2) throw new Error("Invalid or excessive anchor envelope encoding");
  const bytes = Buffer.from(envelopeHex.slice(2), "hex");
  const magic = bytes.subarray(0, 8).toString("ascii");
  if (!((magic === "GDSANCH1" && bytes.length === 92) || (magic === "GDSANCH2" && bytes.length >= 98))) {
    throw new Error("Expected a 92-byte GDSANCH1 or bounded GDSANCH2 envelope");
  }
  const uuid = bytes.subarray(8, 24).toString("hex");
  const result = {
    version: magic === "GDSANCH1" ? 1 : 2,
    batchId: `${uuid.slice(0, 8)}-${uuid.slice(8, 12)}-${uuid.slice(12, 16)}-${uuid.slice(16, 20)}-${uuid.slice(20)}`,
    receiptCount: bytes.readUInt32BE(24), rootSha256: bytes.subarray(28, 60).toString("hex"),
    previousRootSha256: bytes.subarray(60, 92).equals(Buffer.alloc(32)) ? null : bytes.subarray(60, 92).toString("hex"),
  };
  if (result.version === 2) {
    if (bytes.readUInt32BE(92) !== bytes.length - 96) throw new Error("Rationale UTF-8 byte length mismatch");
    const json = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.subarray(96));
    result.rationaleEntries = JSON.parse(json);
    if (canonicalRationaleJson(result.rationaleEntries) !== json) throw new Error("Rationale JSON is not canonical");
  }
  if (buildEnvelope(result) !== envelopeHex) throw new Error("Envelope does not round-trip canonically");
  return result;
}

export function buildManifest({ batchId, previousBatchId, previousRootSha256, receipts }) {
  if (!UUID.test(batchId) || (previousBatchId !== null && !UUID.test(previousBatchId))) throw new Error("Invalid batch UUID");
  if ((previousBatchId === null) !== (previousRootSha256 === null)) throw new Error("Previous batch and root must both be present or absent");
  if (previousRootSha256 !== null) hashBytes(previousRootSha256);
  return JSON.stringify({ schemaVersion: "1.0", batchId, previousBatchId, previousRootSha256, receipts: orderedReceipts(receipts) });
}
