import {
  buildEnvelope, buildManifest, createMerkleTree, POLKADOT_GENESIS_HASH,
  POLKADOT_SIGNER_ADDRESS, sha256, verifyReceiptProof,
} from "../../../packages/anchoring/proofs.mjs";
import { getDatabase } from "@/lib/database";
import type { FinalizedAnchorBatch, PassageAnchoring, ReceiptInclusionProof } from "@/lib/types";

const CHAIN_HASH = /^0x[0-9a-f]{64}$/;
const SEQUENCE = /^[1-9][0-9]*$/;

type SavedBatch = Omit<FinalizedAnchorBatch, "explorerUrl"> & { manifestJson: string };
export type AnchorHistoryRow = {
  sequence: string;
  receipt_json: string;
  receipt_sha256: string;
  membership_sha256: string | null;
  leaf_index: number | null;
  proof: ReceiptInclusionProof | null;
  batch: SavedBatch | null;
};

function checkBatch(saved: SavedBatch): { batch: FinalizedAnchorBatch; receipts: Array<{ sequence: string; receiptSha256: string }> } {
  const manifest = JSON.parse(saved.manifestJson);
  const tree = createMerkleTree(manifest.receipts);
  if (manifest.schemaVersion !== "1.0" || manifest.batchId !== saved.batchId ||
      manifest.previousBatchId !== saved.previousBatchId || manifest.previousRootSha256 !== saved.previousRootSha256 ||
      buildManifest(manifest) !== saved.manifestJson ||
      tree.rootSha256 !== saved.rootSha256 || tree.receipts.length !== saved.receiptCount ||
      tree.receipts[0].sequence !== saved.firstReceiptSequence || tree.receipts.at(-1)?.sequence !== saved.lastReceiptSequence ||
      buildEnvelope(saved) !== saved.envelopeHex || saved.genesisHash !== POLKADOT_GENESIS_HASH ||
      saved.signerAddress !== POLKADOT_SIGNER_ADDRESS ||
      !CHAIN_HASH.test(saved.blockHash) || !CHAIN_HASH.test(saved.extrinsicHash) || !CHAIN_HASH.test(saved.finalizedHeadHash) ||
      !/^(0|[1-9][0-9]*)$/.test(saved.blockNumber) ||
      !Number.isSafeInteger(saved.extrinsicIndex) || saved.extrinsicIndex < 0 ||
      !Number.isSafeInteger(saved.eventIndex) || saved.eventIndex < 0 ||
      !Number.isFinite(new Date(saved.blockTimestamp).getTime())) {
    throw new Error("Finalized anchor evidence failed its integrity check");
  }
  const { manifestJson: _manifestJson, ...metadata } = saved;
  void _manifestJson;
  return {
    batch: {
      ...metadata,
      blockTimestamp: new Date(saved.blockTimestamp).toISOString(),
      explorerUrl: `https://assethub-polkadot.subscan.io/extrinsic/${saved.blockNumber}-${saved.extrinsicIndex}`,
    },
    receipts: tree.receipts,
  };
}

// This validates supplied receipt history and persisted commitment evidence. A
// reader must independently query the named chain to authenticate that evidence.
export function anchoringFromRows(rows: AnchorHistoryRow[], passageId: string, latestReceiptSha256: string): PassageAnchoring {
  let previousReceipt: string | null = null;
  let previousSequence = 0n;
  const checked = new Map<string, ReturnType<typeof checkBatch>>();
  const history: PassageAnchoring["history"] = [];
  for (const row of rows) {
    const receipt = JSON.parse(row.receipt_json);
    if (!SEQUENCE.test(row.sequence) || BigInt(row.sequence) <= previousSequence ||
        sha256(row.receipt_json) !== row.receipt_sha256 || receipt.passageId !== passageId ||
        receipt.previousReceiptSha256 !== previousReceipt) {
      throw new Error("Receipt history failed its integrity check");
    }
    previousReceipt = row.receipt_sha256;
    previousSequence = BigInt(row.sequence);
    if (!row.batch) {
      history.push({ sequence: row.sequence, receiptSha256: row.receipt_sha256, status: "pending" });
      continue;
    }
    const batchId = row.batch.batchId;
    if (!checked.has(batchId)) checked.set(batchId, checkBatch(row.batch));
    const { batch, receipts } = checked.get(batchId)!;
    if (!row.proof || row.membership_sha256 !== row.receipt_sha256 || row.leaf_index !== row.proof.leafIndex ||
        row.proof.leafCount !== batch.receiptCount ||
        receipts[row.proof.leafIndex]?.sequence !== row.sequence ||
        receipts[row.proof.leafIndex]?.receiptSha256 !== row.receipt_sha256 ||
        !verifyReceiptProof(row.receipt_sha256, row.proof, batch.rootSha256)) {
      throw new Error("Receipt inclusion proof failed its integrity check");
    }
    history.push({ sequence: row.sequence, receiptSha256: row.receipt_sha256, status: "finalized", batchId, inclusionProof: row.proof });
  }
  if (history.length === 0 || previousReceipt !== latestReceiptSha256) {
    throw new Error("Publication changed while the proof was being prepared; retry");
  }
  const finalizedReceipts = history.filter((receipt) => receipt.status === "finalized").length;
  return {
    status: finalizedReceipts === history.length ? "finalized" : finalizedReceipts ? "partial" : "pending",
    totalReceipts: history.length,
    finalizedReceipts,
    pendingReceipts: history.length - finalizedReceipts,
    verification: "local-integrity-checked-chain-evidence-recorded",
    history,
    batches: Array.from(checked.values(), (value) => value.batch),
    limits: "Inclusion proves these receipt bytes match the supplied batch commitment. Independently verify the exact remark, successful dispatch, signer and finalized block on the named chain. An anchor establishes existence by that block; it does not authenticate older recorded dates, source attribution, human review, or prove that every event was recorded. Pending receipts have no finalized anchor.",
  };
}

export async function getPassageAnchoring(passageId: string, latestReceiptSha256: string): Promise<PassageAnchoring> {
  const sql = getDatabase();
  const rows = await sql<AnchorHistoryRow[]>`
    SELECT r.sequence::text, r.receipt_json, r.receipt_sha256,
      m.receipt_sha256 AS membership_sha256, m.leaf_index, m.proof,
      CASE WHEN b.id IS NULL THEN NULL ELSE jsonb_build_object(
        'batchId', b.id, 'previousBatchId', b.previous_batch_id,
        'previousRootSha256', b.previous_root_sha256, 'rootSha256', b.root_sha256,
        'receiptCount', b.receipt_count, 'firstReceiptSequence', b.first_receipt_sequence::text,
        'lastReceiptSequence', b.last_receipt_sequence::text, 'manifestJson', b.manifest_json,
        'envelopeHex', b.envelope_hex, 'genesisHash', b.genesis_hash, 'signerAddress', b.signer_address,
        'blockHash', b.block_hash, 'blockNumber', b.block_number::text, 'blockTimestamp', b.finalized_at,
        'extrinsicHash', b.extrinsic_hash, 'extrinsicIndex', b.extrinsic_index,
        'eventIndex', b.event_index, 'finalizedHeadHash', b.finalized_head_hash
      ) END AS batch
    FROM passage_verification_receipts r
    LEFT JOIN polkadot_anchor_memberships m ON m.receipt_sequence = r.sequence
    LEFT JOIN polkadot_anchor_batches b ON b.id = m.batch_id AND b.status = 'finalized'
    WHERE r.passage_id = ${passageId}::uuid ORDER BY r.sequence
  `;
  return anchoringFromRows(rows, passageId, latestReceiptSha256);
}
