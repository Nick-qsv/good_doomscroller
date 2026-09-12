import { describe, expect, it } from "vitest";
import { anchoringFromRows, type AnchorHistoryRow } from "@/lib/anchoring";
import { buildEnvelope, buildManifest, createMerkleTree, POLKADOT_GENESIS_HASH, POLKADOT_SIGNER_ADDRESS, sha256 } from "../../../packages/anchoring/proofs.mjs";

const passageId = "a73cc6ee-f313-440b-a5f8-84ff7fd8db56";
const batchId = "1436dc8e-3357-4a0d-8d5d-bfd38d7e5ea4";

function fixture(): AnchorHistoryRow[] {
  const firstJson = JSON.stringify({ passageId, previousReceiptSha256: null });
  const secondJson = JSON.stringify({ passageId, previousReceiptSha256: sha256(firstJson) });
  const receipts = [{ sequence: "1", receiptSha256: sha256(firstJson) }, { sequence: "3", receiptSha256: sha256(secondJson) }];
  const tree = createMerkleTree(receipts);
  const batch = {
    batchId, previousBatchId: null, previousRootSha256: null,
    rootSha256: tree.rootSha256, receiptCount: 2, firstReceiptSequence: "1", lastReceiptSequence: "3",
    manifestJson: buildManifest({ batchId, previousBatchId: null, previousRootSha256: null, receipts }),
    envelopeHex: buildEnvelope({ batchId, receiptCount: 2, rootSha256: tree.rootSha256, previousRootSha256: null }),
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
