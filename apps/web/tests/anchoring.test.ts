import { describe, expect, it } from "vitest";
import { anchoringFromRows, type AnchorHistoryRow } from "@/lib/anchoring";
import { buildEnvelope, buildManifest, createMerkleTree, parseEnvelope, receiptRationale, POLKADOT_GENESIS_HASH, POLKADOT_SIGNER_ADDRESS, sha256 } from "../../../packages/anchoring/proofs.mjs";

const passageId = "a73cc6ee-f313-440b-a5f8-84ff7fd8db56";
const batchId = "1436dc8e-3357-4a0d-8d5d-bfd38d7e5ea4";

function fixture(withRationales = false): AnchorHistoryRow[] {
  const firstJson = JSON.stringify({ schemaVersion: "1.0", passageId, previousReceiptSha256: null, selection: { reason: "A complete reflection on learning and curiosity." } });
  const secondJson = JSON.stringify({ schemaVersion: "1.0", passageId, previousReceiptSha256: sha256(firstJson), selection: { reason: "A complete reflection on learning and curiosity.", selectionRecordedAt: "2026-09-13T10:00:00Z" } });
  const receipts = [{ sequence: "1", receiptSha256: sha256(firstJson) }, { sequence: "3", receiptSha256: sha256(secondJson) }];
  const tree = createMerkleTree(receipts);
  const batch = {
    batchId, previousBatchId: null, previousRootSha256: null,
    rootSha256: tree.rootSha256, receiptCount: 2, firstReceiptSequence: "1", lastReceiptSequence: "3",
    manifestJson: buildManifest({ batchId, previousBatchId: null, previousRootSha256: null, receipts }),
    envelopeHex: buildEnvelope({ batchId, receiptCount: 2, rootSha256: tree.rootSha256, previousRootSha256: null,
      rationaleEntries: withRationales ? [firstJson, secondJson].map((receiptJson, index) => receiptRationale({ receiptJson, receiptSha256: receipts[index].receiptSha256 })) : undefined }),
    genesisHash: POLKADOT_GENESIS_HASH, signerAddress: POLKADOT_SIGNER_ADDRESS,
    blockHash: "0x" + "a".repeat(64), blockNumber: "20577500", blockTimestamp: "2026-09-12T22:00:00Z",
    extrinsicHash: "0x" + "b".repeat(64), extrinsicIndex: 2, eventIndex: 4, finalizedHeadHash: "0x" + "c".repeat(64),
  };
  return receipts.map((receipt, index) => ({
    sequence: receipt.sequence, receipt_json: index ? secondJson : firstJson,
    receipt_sha256: receipt.receiptSha256, membership_sha256: receipt.receiptSha256,
    leaf_index: index, proof: tree.proofs[index], batch,
  }));
}

describe("public anchoring evidence", () => {
  it("includes an independently checkable membership for every supplied receipt", () => {
    const rows = fixture();
    const result = anchoringFromRows(rows, passageId, rows[1].receipt_sha256);
    expect(result.status).toBe("finalized");
    expect(result.finalizedReceipts).toBe(2);
    expect(result.history.every((entry) => entry.inclusionProof)).toBe(true);
    expect(result.batches).toHaveLength(1);
    expect(result.batches[0].explorerUrl).toBe("https://assethub-polkadot.subscan.io/extrinsic/20577500-2");
    expect(result.batches[0]).not.toHaveProperty("manifestJson");
    expect(result.limits).toContain("does not authenticate older recorded dates");
  });

  it("reports partial history when the latest receipt is anchored but an earlier receipt is pending", () => {
    const rows = fixture();
    rows[0] = { ...rows[0], batch: null, proof: null };
    const result = anchoringFromRows(rows, passageId, rows[1].receipt_sha256);
    expect(result.status).toBe("partial");
    expect(result.pendingReceipts).toBe(1);
    expect(result.history[0].status).toBe("pending");
    expect(result.history[1].status).toBe("finalized");
  });

  it("exposes exact rationale text only when the finalized envelope includes it", () => {
    const rows = fixture(true);
    const result = anchoringFromRows(rows, passageId, rows[1].receipt_sha256);
    expect(result.onChainRationaleReceipts).toBe(2);
    expect(result.batches[0].format).toBe("rationales");
    expect(result.history[0].rationale).toEqual({ status: "on-chain", reason: "A complete reflection on learning and curiosity." });
    expect(result.history[1].rationale?.selectionRecordedAt).toBe("2026-09-13T10:00:00Z");
    const legacy = fixture();
    const old = anchoringFromRows(legacy, passageId, legacy[1].receipt_sha256);
    expect(old.onChainRationaleReceipts).toBe(0);
    expect(old.history[0].rationale).toEqual({ status: "hash-only" });
  });

  it("rejects a rationale changed independently of its otherwise valid receipt hash", () => {
    const rows = fixture(true);
    const batch = rows[0].batch!;
    const decoded = parseEnvelope(batch.envelopeHex);
    decoded.rationaleEntries![0].selection.reason = "An invented explanation.";
    batch.envelopeHex = buildEnvelope(decoded);
    expect(() => anchoringFromRows(rows, passageId, rows[1].receipt_sha256)).toThrow("On-chain rationale does not match its receipt");
  });

  it("does not treat prepared or broadcast commitments as finalized evidence", () => {
    const rows = fixture().map((row) => ({ ...row, batch: null }));
    const result = anchoringFromRows(rows, passageId, rows[1].receipt_sha256);
    expect(result.status).toBe("pending");
    expect(result.batches).toEqual([]);
    expect(result.history.every((entry) => !entry.inclusionProof)).toBe(true);
  });

  it("rejects changed receipts, missing history, incorrect chain, envelope or inclusion proof", () => {
    const edits: Array<(rows: AnchorHistoryRow[]) => void> = [
      (rows) => { rows[0].receipt_json += " "; },
      (rows) => { rows.shift(); },
      (rows) => { rows[0].batch!.genesisHash = "0x" + "0".repeat(64); },
      (rows) => { rows[0].batch!.signerAddress = "another signer"; },
      (rows) => { rows[0].batch!.envelopeHex = "0x" + "0".repeat(184); },
      (rows) => { rows[0].proof!.siblings[0].sha256 = "0".repeat(64); },
      (rows) => { rows[0].proof!.leafCount = 3; },
      (rows) => { rows[0].membership_sha256 = rows[1].receipt_sha256; },
      (rows) => { rows[0].leaf_index = 1; },
    ];
    for (const edit of edits) {
      const rows = fixture();
      const latest = rows[1].receipt_sha256;
      edit(rows);
      expect(() => anchoringFromRows(rows, passageId, latest)).toThrow();
    }
  });
});
