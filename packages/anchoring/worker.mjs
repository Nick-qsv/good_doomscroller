import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';
import {
  POLKADOT_GENESIS_HASH, POLKADOT_SIGNER_ADDRESS, buildEnvelope,
  buildManifest, createMerkleTree, sha256, verifyReceiptProof,
} from './proofs.mjs';

const LOCK = 1203217642;
export class AnchorWorkerError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const requireValue = (condition, code) => { if (!condition) throw new AnchorWorkerError(code); };
const intString = (value) => String(value);

// postgres.js reserves a physical session but does not expose begin() on that
// handle. Keep both transaction boundaries and the advisory lock on this session.
async function transaction(sql, callback, repeatableRead = false) {
  await sql.unsafe(repeatableRead ? 'BEGIN ISOLATION LEVEL REPEATABLE READ' : 'BEGIN');
  try {
    const value = await callback(sql);
    await sql.unsafe('COMMIT');
    return value;
  } catch (error) {
    await sql.unsafe('ROLLBACK').catch(() => {});
    throw error;
  }
}

export function workerConfig(env = process.env) {
  const number = (name, fallback, maximum) => {
    const raw = env[name] ?? fallback;
    requireValue(/^\d+$/.test(raw), 'INVALID_LIMIT');
    const value = BigInt(raw);
    requireValue(value > 0n && value <= maximum, 'INVALID_LIMIT');
    return value;
  };
  const maxFeePlanck = number('ANCHOR_MAX_FEE_PLANCK', '50000000', 50000000n);
  const minBalancePlanck = number('ANCHOR_MIN_BALANCE_PLANCK', '10000000000', 200000000000n);
  requireValue(minBalancePlanck >= 10000000000n, 'RESERVE_TOO_LOW');
  return {
    maxFeePlanck,
    minBalancePlanck,
    annualFeeLimitPlanck: number('ANCHOR_ANNUAL_FEE_LIMIT_PLANCK', '20000000000', 20000000000n),
    maxDailyAttempts: Number(number('MAX_DAILY_ATTEMPTS', '3', 3n)),
    lowBalancePlanck: 20000000000n,
  };
}

function checkedReceipts(rows) {
  for (const row of rows) {
    requireValue(sha256(row.receipt_json) === row.receipt_sha256, 'RECEIPT_HASH_MISMATCH');
    let receipt;
    try { receipt = JSON.parse(row.receipt_json); } catch { throw new AnchorWorkerError('INVALID_RECEIPT'); }
    requireValue(receipt.passageId === row.passage_id &&
      receipt.previousReceiptSha256 === row.expected_previous, 'RECEIPT_HISTORY_MISMATCH');
  }
  return rows.map(row => ({ sequence: intString(row.sequence), receiptSha256: row.receipt_sha256 }));
}

async function unbatchedReceipts(sql) {
  return sql`
    SELECT r.sequence, r.passage_id, r.receipt_json, r.receipt_sha256,
      (SELECT prior.receipt_sha256 FROM passage_verification_receipts prior
       WHERE prior.passage_id = r.passage_id AND prior.sequence < r.sequence
       ORDER BY prior.sequence DESC LIMIT 1) AS expected_previous
    FROM passage_verification_receipts r
    WHERE NOT EXISTS (SELECT 1 FROM polkadot_anchor_memberships m WHERE m.receipt_sequence = r.sequence)
    ORDER BY r.sequence LIMIT 100000
  `;
}

async function loadBatch(sql, dryRun) {
  const pending = await sql`SELECT * FROM polkadot_anchor_batches WHERE status = 'pending' ORDER BY sequence`;
  requireValue(pending.length <= 1, 'MULTIPLE_PENDING_BATCHES');
  if (pending[0]) return pending[0];
  return transaction(sql, async tx => {
    const rows = await unbatchedReceipts(tx);
    if (!rows.length) return null;
    const receipts = checkedReceipts(rows);
    const tree = createMerkleTree(receipts);
    const [previous] = await tx`SELECT * FROM polkadot_anchor_batches WHERE status = 'finalized' ORDER BY sequence DESC LIMIT 1`;
    const id = randomUUID();
    const previousBatchId = previous?.id ?? null;
    const previousRootSha256 = previous?.root_sha256 ?? null;
    const manifestJson = buildManifest({ batchId: id, previousBatchId, previousRootSha256, receipts });
    const envelopeHex = buildEnvelope({ batchId: id, receiptCount: receipts.length, rootSha256: tree.rootSha256, previousRootSha256 });
    const record = {
      id, previous_batch_id: previousBatchId, previous_root_sha256: previousRootSha256,
      root_sha256: tree.rootSha256, receipt_count: receipts.length,
      first_receipt_sequence: receipts[0].sequence, last_receipt_sequence: receipts.at(-1).sequence,
      manifest_json: manifestJson, envelope_hex: envelopeHex, status: 'pending',
      genesis_hash: POLKADOT_GENESIS_HASH, signer_address: POLKADOT_SIGNER_ADDRESS,
    };
    if (dryRun) return record;
    const [saved] = await tx`INSERT INTO polkadot_anchor_batches ${tx(record)} RETURNING *`;
    // Chunk to stay below PostgreSQL's parameter limit for larger corpora.
    for (let start = 0; start < receipts.length; start += 1000) {
      const members = receipts.slice(start, start + 1000).map((receipt, offset) => ({
        batch_id: id, receipt_sequence: receipt.sequence, receipt_sha256: receipt.receiptSha256,
        leaf_index: start + offset, proof: tx.json(tree.proofs[start + offset]),
      }));
      await tx`INSERT INTO polkadot_anchor_memberships ${tx(members)}`;
    }
    return saved;
  }, true);
}

async function validateBatch(sql, batch) {
  const rows = await sql`
    SELECT r.sequence, r.passage_id, r.receipt_json, r.receipt_sha256,
      m.leaf_index, m.proof, m.receipt_sha256 AS membership_hash,
      (SELECT prior.receipt_sha256 FROM passage_verification_receipts prior
       WHERE prior.passage_id = r.passage_id AND prior.sequence < r.sequence
       ORDER BY prior.sequence DESC LIMIT 1) AS expected_previous
    FROM polkadot_anchor_memberships m
    JOIN passage_verification_receipts r ON r.sequence = m.receipt_sequence
    WHERE m.batch_id = ${batch.id}::uuid ORDER BY r.sequence
  `;
  const receipts = checkedReceipts(rows);
  requireValue(receipts.length === batch.receipt_count, 'MEMBERSHIP_COUNT_MISMATCH');
  const tree = createMerkleTree(receipts);
  requireValue(tree.rootSha256 === batch.root_sha256 &&
    batch.genesis_hash === POLKADOT_GENESIS_HASH && batch.signer_address === POLKADOT_SIGNER_ADDRESS,
  'BATCH_IDENTITY_MISMATCH');
  requireValue(buildManifest({ batchId: batch.id, previousBatchId: batch.previous_batch_id,
    previousRootSha256: batch.previous_root_sha256, receipts }) === batch.manifest_json, 'MANIFEST_MISMATCH');
  requireValue(buildEnvelope({ batchId: batch.id, receiptCount: receipts.length,
    rootSha256: tree.rootSha256, previousRootSha256: batch.previous_root_sha256 }) === batch.envelope_hex,
  'ENVELOPE_MISMATCH');
  requireValue(receipts[0].sequence === intString(batch.first_receipt_sequence) &&
    receipts.at(-1).sequence === intString(batch.last_receipt_sequence), 'SEQUENCE_MISMATCH');
  rows.forEach((row, index) => requireValue(row.leaf_index === index &&
    row.membership_hash === row.receipt_sha256 && row.proof.leafCount === receipts.length &&
    row.proof.leafIndex === index && verifyReceiptProof(row.receipt_sha256, row.proof, tree.rootSha256),
  'INCLUSION_PROOF_MISMATCH'));
}

async function validatePrevious(sql, chain, batch) {
  const [latest] = await sql`SELECT id FROM polkadot_anchor_batches WHERE status = 'finalized' ORDER BY sequence DESC LIMIT 1`;
  requireValue((latest?.id ?? null) === batch.previous_batch_id, 'PREVIOUS_BATCH_NOT_LATEST');
  if (!batch.previous_batch_id) {
    requireValue(batch.previous_root_sha256 === null, 'PREVIOUS_ROOT_MISMATCH');
    return;
  }
  const [previous] = await sql`SELECT * FROM polkadot_anchor_batches WHERE id = ${batch.previous_batch_id}::uuid`;
  requireValue(previous?.status === 'finalized' && previous.root_sha256 === batch.previous_root_sha256, 'PREVIOUS_BATCH_MISMATCH');
  requireValue(buildEnvelope({ batchId: previous.id, receiptCount: previous.receipt_count,
    rootSha256: previous.root_sha256, previousRootSha256: previous.previous_root_sha256 }) === previous.envelope_hex,
  'PREVIOUS_ENVELOPE_MISMATCH');
  const verified = await chain.verifyFinalizedCommitment({ blockHash: previous.block_hash,
    extrinsicHash: previous.extrinsic_hash, extrinsicIndex: previous.extrinsic_index,
    payloadHex: previous.envelope_hex, signerAddress: POLKADOT_SIGNER_ADDRESS });
  requireValue(verified.status === 'finalized', 'PREVIOUS_ANCHOR_NOT_SUCCESSFUL');
}

function matchPrepared(prepared, batch, row) {
  requireValue(prepared.genesisHash === POLKADOT_GENESIS_HASH &&
    prepared.signerAddress === POLKADOT_SIGNER_ADDRESS && prepared.payloadHex === batch.envelope_hex,
  'PREPARED_IDENTITY_MISMATCH');
  if (row) requireValue(prepared.signedHex === row.signed_extrinsic_hex &&
    prepared.extrinsicHash === row.extrinsic_hash && String(prepared.nonce) === intString(row.nonce) &&
    String(prepared.eraBirth) === intString(row.era_birth) && String(prepared.eraDeath) === intString(row.era_death) &&
    String(prepared.estimatedFeePlanck) === intString(row.estimated_fee_planck), 'PREPARED_RECORD_MISMATCH');
}

async function applyResult(sql, batch, attempt, result) {
  if (result.status === 'finalized') {
    requireValue(result.extrinsicHash === attempt.extrinsic_hash, 'FINALIZED_TRANSACTION_MISMATCH');
    await transaction(sql, async tx => {
      await tx`UPDATE polkadot_anchor_attempts SET status = 'finalized', finalized_at = now(),
        fee_paid_planck = ${result.feePaidPlanck ?? null} WHERE id = ${attempt.id}::uuid`;
      await tx`UPDATE polkadot_anchor_batches SET status = 'finalized',
        finalized_at = ${result.blockTimestamp}::timestamptz, verified_at = now(),
        block_hash = ${result.blockHash}, block_number = ${result.blockNumber},
        extrinsic_hash = ${result.extrinsicHash}, extrinsic_index = ${result.extrinsicIndex},
        event_index = ${result.eventIndex}, finalized_head_hash = ${result.finalizedHeadHash}
        WHERE id = ${batch.id}::uuid`;
    });
    return 'complete';
  }
  if (result.status === 'expired') {
    await sql`UPDATE polkadot_anchor_attempts SET status = 'expired', error_code = 'EXPIRED_WITHOUT_INCLUSION'
      WHERE id = ${attempt.id}::uuid`;
    return 'expired';
  }
  if (result.status === 'failed') {
    await sql`UPDATE polkadot_anchor_attempts SET status = 'failed', error_code = 'ON_CHAIN_DISPATCH_FAILED',
      fee_paid_planck = ${result.feePaidPlanck ?? null} WHERE id = ${attempt.id}::uuid`;
    throw new AnchorWorkerError('ON_CHAIN_DISPATCH_FAILED');
  }
  requireValue(result.status === 'pending', 'CHAIN_NONCE_CONFLICT');
  return 'pending';
}

export async function runAnchoring({ sql, chain, seedHex, config = workerConfig({}), dryRun = false, log = console.log }) {
  const reserved = await sql.reserve();
  let locked = false;
  try {
    const [lock] = await reserved`SELECT pg_try_advisory_lock(${LOCK}) AS acquired`;
    locked = lock.acquired;
    if (!locked) return { event: 'anchor_run', status: 'busy' };
    const state = await chain.readState();
    requireValue(state.genesisHash === POLKADOT_GENESIS_HASH, 'WRONG_CHAIN');
    const balancePlanck = String(state.balancePlanck);
    const base = { event: 'anchor_run', balancePlanck, lowBalance: BigInt(balancePlanck) < config.lowBalancePlanck };
    const batch = await loadBatch(reserved, dryRun);
    if (!batch) return { ...base, status: dryRun ? 'dry_run' : 'idle', receiptCount: 0 };
    if (dryRun) {
      if (batch.sequence !== undefined) await validateBatch(reserved, batch);
      await validatePrevious(reserved, chain, batch);
      // prepare quotes using a dummy transaction and verifies the real signature
      // locally. It never sends the real signed bytes to an RPC. Discard them here.
      const prepared = await chain.prepare({ payloadHex: batch.envelope_hex, seedHex,
        maxFeePlanck: String(config.maxFeePlanck), minBalancePlanck: String(config.minBalancePlanck), eraPeriod: 64 });
      matchPrepared(prepared, batch);
      return { ...base, status: 'dry_run', receiptCount: batch.receipt_count, rootSha256: batch.root_sha256,
        estimatedFeePlanck: String(prepared.estimatedFeePlanck), signerAddress: prepared.signerAddress };
    }
    await validateBatch(reserved, batch);
    await validatePrevious(reserved, chain, batch);
    let [attempt] = await reserved`SELECT * FROM polkadot_anchor_attempts WHERE batch_id = ${batch.id}::uuid ORDER BY created_at DESC, id DESC LIMIT 1`;
    if (attempt?.status === 'failed') throw new AnchorWorkerError('FAILED_ATTEMPT_REQUIRES_REVIEW');
    requireValue(attempt?.status !== 'finalized', 'INCONSISTENT_FINALIZATION');
    if (attempt && ['prepared', 'broadcast'].includes(attempt.status)) {
      matchPrepared(attempt.prepared_json, batch, attempt);
      const recovered = await chain.recover(attempt.prepared_json);
      const status = await applyResult(reserved, batch, attempt, recovered);
      if (status === 'complete') return { ...base, status, batchId: batch.id, receiptCount: batch.receipt_count, ...publicFinalized(recovered) };
      if (status === 'expired') attempt = null;
    } else if (attempt?.status === 'expired') attempt = null;
    if (!attempt) {
      const [budget] = await reserved`
        SELECT COALESCE(sum(greatest(estimated_fee_planck, COALESCE(fee_paid_planck, ${String(config.maxFeePlanck)}::numeric)))
          FILTER (WHERE created_at >= now() - interval '365 days'), 0)::text AS annual,
          count(*) FILTER (WHERE created_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'))::int AS daily
        FROM polkadot_anchor_attempts
      `;
      requireValue(budget.daily < config.maxDailyAttempts, 'DAILY_ATTEMPT_LIMIT');
      requireValue(BigInt(budget.annual) + config.maxFeePlanck <= config.annualFeeLimitPlanck, 'ANNUAL_FEE_LIMIT');
      const [last] = await reserved`SELECT nonce FROM polkadot_anchor_attempts WHERE status = 'finalized' ORDER BY nonce DESC LIMIT 1`;
      const current = await chain.readState();
      requireValue(BigInt(current.nonce) === (last ? BigInt(last.nonce) + 1n : 0n), 'UNTRACKED_SIGNER_NONCE');
      requireValue(BigInt(current.balancePlanck) - config.maxFeePlanck >= config.minBalancePlanck, 'BALANCE_RESERVE');
      const prepared = await chain.prepare({ payloadHex: batch.envelope_hex, seedHex,
        maxFeePlanck: String(config.maxFeePlanck), minBalancePlanck: String(config.minBalancePlanck), eraPeriod: 64 });
      matchPrepared(prepared, batch);
      requireValue(BigInt(prepared.estimatedFeePlanck) <= config.maxFeePlanck &&
        BigInt(prepared.nonce) === BigInt(current.nonce), 'PREPARED_LIMIT_MISMATCH');
      [attempt] = await reserved`INSERT INTO polkadot_anchor_attempts ${reserved({
        id: randomUUID(), batch_id: batch.id, extrinsic_hash: prepared.extrinsicHash,
        signed_extrinsic_hex: prepared.signedHex, prepared_json: reserved.json(prepared),
        nonce: String(prepared.nonce), era_birth: String(prepared.eraBirth), era_death: String(prepared.eraDeath),
        estimated_fee_planck: String(prepared.estimatedFeePlanck), status: 'prepared',
      })} RETURNING *`;
    }
    // A committed attempt is the durable outbox. Reuse the exact signed bytes
    // after a crash; never sign a replacement until finalized recovery proves expiry.
    requireValue(BigInt(attempt.prepared_json.maxFeePlanck) <= config.maxFeePlanck &&
      BigInt(attempt.prepared_json.minBalancePlanck) >= config.minBalancePlanck, 'PREPARED_POLICY_CHANGED');
    await reserved`UPDATE polkadot_anchor_attempts SET status = 'broadcast', broadcast_at = COALESCE(broadcast_at, now())
      WHERE id = ${attempt.id}::uuid`;
    log(JSON.stringify({ event: 'anchor_broadcast', batchId: batch.id, extrinsicHash: attempt.extrinsic_hash }));
    const result = await chain.submitAndFinalize(attempt.prepared_json);
    const status = await applyResult(reserved, batch, attempt, result);
    return { ...base, status: status === 'expired' ? 'pending' : status,
      batchId: batch.id, receiptCount: batch.receipt_count,
      ...(status === 'complete' ? publicFinalized(result) : {}) };
  } finally {
    if (locked) await reserved`SELECT pg_advisory_unlock(${LOCK})`.catch(() => {});
    reserved.release();
  }
}

function publicFinalized(result) {
  return { extrinsicHash: result.extrinsicHash, blockHash: result.blockHash,
    blockNumber: result.blockNumber, feePlanck: result.feePaidPlanck ?? null };
}

export function databaseClient(env = process.env) {
  let secret;
  try { secret = JSON.parse(env.DATABASE_SECRET_JSON || '{}'); } catch { throw new AnchorWorkerError('INVALID_DATABASE_CONFIG'); }
  const host = env.DATABASE_HOST;
  const database = env.DATABASE_NAME;
  requireValue(host && database && secret.username && secret.password && env.RDS_CA_PATH, 'INVALID_DATABASE_CONFIG');
  return postgres({ host, database, username: secret.username, password: secret.password,
    port: Number(env.DATABASE_PORT || '5432'), max: 2, connect_timeout: 15, idle_timeout: 20,
    onnotice: () => {}, ssl: { ca: readFileSync(env.RDS_CA_PATH, 'utf8'), rejectUnauthorized: true } });
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  requireValue(process.argv.slice(2).every(arg => arg === '--dry-run'), 'INVALID_ARGUMENT');
  requireValue(process.env.AWS_REGION === 'us-east-2', 'WRONG_AWS_REGION');
  requireValue(process.env.POLKADOT_SIGNER_ADDRESS === POLKADOT_SIGNER_ADDRESS, 'WRONG_SIGNER');
  const seedHex = process.env.POLKADOT_SEED_HEX;
  requireValue(/^0x[0-9a-f]{64}$/.test(seedHex || ''), 'SIGNER_NOT_RESOLVED');
  const sql = databaseClient();
  const config = workerConfig();
  delete process.env.POLKADOT_SEED_HEX;
  delete process.env.DATABASE_SECRET_JSON;
  const { createChainClient } = await import('./chain.mjs');
  let chain;
  try {
    chain = await createChainClient({ rpcEndpoints: process.env.POLKADOT_RPC_URL ?
      [process.env.POLKADOT_RPC_URL, 'wss://asset-hub-polkadot-rpc.n.dwellir.com'] : undefined,
    genesisHash: POLKADOT_GENESIS_HASH, signerAddress: POLKADOT_SIGNER_ADDRESS });
    const result = await runAnchoring({ sql, chain, seedHex, config, dryRun });
    console.log(JSON.stringify(result));
  } finally { if (chain) await chain.disconnect(); await sql.end({ timeout: 5 }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const timer = setTimeout(() => { console.error(JSON.stringify({ event: 'anchor_error', code: 'WORKER_TIMEOUT' })); process.exit(1); }, 12 * 60 * 1000);
  main().catch(error => {
    // Never log arbitrary exception text, provider replies, SQL, env, or stacks.
    console.error(JSON.stringify({ event: 'anchor_error', code: error instanceof AnchorWorkerError ? error.code : 'ANCHOR_RUN_FAILED' }));
    process.exitCode = 1;
  }).finally(() => clearTimeout(timer));
}
