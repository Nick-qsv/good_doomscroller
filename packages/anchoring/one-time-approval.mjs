import { readFileSync } from 'node:fs';
import {
  POLKADOT_GENESIS_HASH, POLKADOT_SIGNER_ADDRESS, MAX_ANCHOR_PAYLOAD_BYTES,
  buildEnvelope, buildManifest, canonicalRationaleJson, createMerkleTree, orderedReceipts, parseEnvelope, sha256,
} from './proofs.mjs';

export const NORMAL_MAX_FEE_PLANCK = 50000000n;
export const ONE_TIME_MAX_FEE_PLANCK = 12800000000n;
// No environment variable, CLI argument or prepared record can change this pin.
export const PINNED_ONE_TIME_APPROVAL_SHA256 = "7ebd6a567e2d3b12232e4384ee36276fe4f4d5f2a67346fa56a8e8ef8d8bdc96";
const APPROVAL_FILE = new URL('./approved-rationales-2026-09-13.json', import.meta.url);
const trusted = new WeakSet();
const HASH = /^[0-9a-f]{64}$/;
const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

export function validateOneTimeApproval(approvalJson, expectedSha256) {
  ensure(typeof approvalJson === 'string' && HASH.test(expectedSha256) && sha256(approvalJson) === expectedSha256,
    'One-time approval artifact fingerprint mismatch');
  const approval = JSON.parse(approvalJson);
  ensure(approval?.schemaVersion === '1.0' && approval.approvalId === 'rationales-2026-09-13', 'Unknown one-time approval');
  ensure(approval.genesisHash === POLKADOT_GENESIS_HASH && approval.signerAddress === POLKADOT_SIGNER_ADDRESS,
    'One-time approval chain or signer mismatch');
  ensure(typeof approval.maxFeePlanck === 'string' && /^[1-9][0-9]*$/.test(approval.maxFeePlanck) &&
    BigInt(approval.maxFeePlanck) <= ONE_TIME_MAX_FEE_PLANCK, 'One-time fee ceiling exceeds approval');
  ensure(Number.isSafeInteger(approval.maxPayloadBytes) && approval.maxPayloadBytes > 0 &&
    approval.maxPayloadBytes <= MAX_ANCHOR_PAYLOAD_BYTES, 'One-time payload limit exceeds the supported cap');
  ensure(HASH.test(approval.selectionArtifactSha256) && HASH.test(approval.envelopeSha256), 'Invalid one-time scope fingerprint');
  const ordered = orderedReceipts(approval.receipts);
  ensure(approval.receipts.every((receipt, index) => receipt.sequence === ordered[index].sequence &&
    receipt.receiptSha256 === ordered[index].receiptSha256), 'One-time receipts are not in exact sequence order');
  const rationaleEntries = JSON.parse(canonicalRationaleJson(approval.receipts));
  const tree = createMerkleTree(ordered);
  const envelope = parseEnvelope(approval.envelopeHex);
  ensure(envelope.version === 2 && buildEnvelope({ batchId: approval.batchId, receiptCount: ordered.length,
    rootSha256: tree.rootSha256, previousRootSha256: approval.previousRootSha256, rationaleEntries }) === approval.envelopeHex,
  'One-time envelope differs from its approved receipt text or identities');
  buildManifest({ batchId: approval.batchId, previousBatchId: approval.previousBatchId,
    previousRootSha256: approval.previousRootSha256, receipts: ordered });
  const bytes = Buffer.from(approval.envelopeHex.slice(2), 'hex');
  ensure(approval.payloadBytes === bytes.length && bytes.length <= approval.maxPayloadBytes && sha256(bytes) === approval.envelopeSha256,
    'One-time envelope size or fingerprint mismatch');
  approval.approvalSha256 = expectedSha256;
  freeze(approval); trusted.add(approval);
  return approval;
}

export function loadPinnedOneTimeApproval() {
  if (PINNED_ONE_TIME_APPROVAL_SHA256 === null) return undefined;
  return validateOneTimeApproval(readFileSync(APPROVAL_FILE, 'utf8'), PINNED_ONE_TIME_APPROVAL_SHA256);
}

export function anchorPolicy(payloadHex, approval = undefined) {
  if (approval !== undefined) ensure(trusted.has(approval), 'One-time approval was not independently validated');
  if (approval && payloadHex === approval.envelopeHex) return {
    maxFeePlanck: BigInt(approval.maxFeePlanck), maxPayloadBytes: approval.maxPayloadBytes,
    oneTimeApprovalId: approval.approvalId, oneTimeApprovalSha256: approval.approvalSha256,
  };
  return { maxFeePlanck: NORMAL_MAX_FEE_PLANCK, maxPayloadBytes: MAX_ANCHOR_PAYLOAD_BYTES };
}
