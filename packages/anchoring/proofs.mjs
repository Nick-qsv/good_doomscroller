import { createHash } from "node:crypto";

export const POLKADOT_GENESIS_HASH = "0x68d56f15f85d3136970ec16946040bc1752654e906147f7e43e9d539d7c3de2f";
export const POLKADOT_SIGNER_ADDRESS = "12wmbcz2PqfsLdJHhpn12bbkR1Az1ydkEsoJDxkSjCm8Ue59";
const SHA256 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
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

export function buildEnvelope({ batchId, receiptCount, rootSha256, previousRootSha256 }) {
  if (typeof batchId !== "string" || !UUID.test(batchId)) throw new Error("Invalid canonical batch UUID");
  if (!Number.isSafeInteger(receiptCount) || receiptCount < 1 || receiptCount > 100_000) throw new Error("Invalid receipt count");
  const count = Buffer.alloc(4);
  count.writeUInt32BE(receiptCount);
  return "0x" + Buffer.concat([
    Buffer.from("GDSANCH1", "ascii"), Buffer.from(batchId.replaceAll("-", ""), "hex"), count,
    hashBytes(rootSha256), previousRootSha256 === null ? Buffer.alloc(32) : hashBytes(previousRootSha256),
  ]).toString("hex");
}

export function buildManifest({ batchId, previousBatchId, previousRootSha256, receipts }) {
  if (!UUID.test(batchId) || (previousBatchId !== null && !UUID.test(previousBatchId))) throw new Error("Invalid batch UUID");
  if ((previousBatchId === null) !== (previousRootSha256 === null)) throw new Error("Previous batch and root must both be present or absent");
  if (previousRootSha256 !== null) hashBytes(previousRootSha256);
  return JSON.stringify({ schemaVersion: "1.0", batchId, previousBatchId, previousRootSha256, receipts: orderedReceipts(receipts) });
}
