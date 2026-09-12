import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import postgres from 'postgres';
import { runAnchoring, workerConfig } from './worker.mjs';
import { POLKADOT_GENESIS_HASH, POLKADOT_SIGNER_ADDRESS, sha256 } from './proofs.mjs';

const url = process.env.ANCHOR_TEST_DATABASE_URL;
const dbTest = (name, fn) => test(name, { skip: !url }, async () => {
  const admin = postgres(url, { max: 1, onnotice: () => {} });
  const database = `anchor_${randomUUID().replaceAll('-', '')}`;
  await admin.unsafe(`CREATE DATABASE "${database}"`);
  const target = new URL(url); target.pathname = `/${database}`;
  const sql = postgres(target.toString(), { max: 5, onnotice: () => {} });
  try {
    const folder = new URL('../db/migrations/', import.meta.url);
    const migration = await sql.reserve();
    try {
      for (const file of (await readdir(folder)).filter(file => /^\d.*\.sql$/.test(file)).sort()) {
        await migration.unsafe(await readFile(new URL(file, folder), 'utf8'));
      }
    } finally { migration.release(); }
    await fn(sql);
  } finally {
    await sql.end({ timeout: 2 });
    await admin.unsafe(`DROP DATABASE "${database}" WITH (FORCE)`);
    await admin.end({ timeout: 2 });
  }
});

async function fixture(sql, count = 3) {
  const bookId = randomUUID(), editionId = randomUUID(), chapterId = randomUUID(), passageId = randomUUID();
  const content = Buffer.from('A fixture passage.');
  const hash = sha256(content);
  await sql`INSERT INTO books(id,title,author) VALUES(${bookId},'Fixture','Test')`;
  await sql`INSERT INTO editions(id,book_id,source_url,source_sha256,rights_basis,retrieved_at)
    VALUES(${editionId},${bookId},'https://example.org/fixture',${hash},'test',now())`;
  await sql`INSERT INTO chapters(id,edition_id,chapter_index) VALUES(${chapterId},${editionId},0)`;
  await sql`INSERT INTO edition_sources(edition_id,source_sha256,normalized_sha256,normalization_version,original_bytes,normalized_chapters)
    VALUES(${editionId},${hash},${hash},'1',${content},'[]'::jsonb)`;
  await sql`INSERT INTO passages(id,book_id,edition_id,chapter_id,exact_text,source_start,source_end,word_count)
    VALUES(${passageId},${bookId},${editionId},${chapterId},'A fixture passage.',0,18,3)`;
  let previous = null;
  const add = async (overrides = {}) => {
    const body = JSON.stringify({ schemaVersion: '1.0', passageId, previousReceiptSha256: previous,
      action: 'published', testEvent: randomUUID(), ...overrides });
    const [row] = await sql`INSERT INTO passage_verification_receipts(passage_id,edition_id,receipt_json,receipt_sha256)
      VALUES(${passageId},${editionId},${body},${sha256(body)}) RETURNING sequence, receipt_sha256`;
    previous = row.receipt_sha256;
    return row;
  };
  for (let index = 0; index < count; index++) await add();
  return { add, passageId };
}

function fakeChain(sql, controls = {}) {
  let nonce = 0n, prepares = 0, submissions = 0, previousChecks = 0;
  const completed = new Map();
  const submittedHashes = [];
  const state = () => ({ genesisHash: POLKADOT_GENESIS_HASH, nonce: String(controls.nonce ?? nonce), balancePlanck: controls.balance ?? '196618167519' });
  return {
    readState: async () => state(),
    prepare: async ({ payloadHex }) => {
      prepares++;
      return { kind: 'good-doomscroller-polkadot-anchor', schemaVersion: 1,
        genesisHash: POLKADOT_GENESIS_HASH, signerAddress: POLKADOT_SIGNER_ADDRESS,
        payloadHex, signedHex: `0x${sha256(`signed-${prepares}`)}`,
        extrinsicHash: `0x${sha256(`tx-${prepares}`)}`, nonce: String(nonce),
        eraBirth: 100 + prepares, eraDeath: 164 + prepares, estimatedFeePlanck: '12000000',
        maxFeePlanck: '50000000', minBalancePlanck: '10000000000' };
    },
    recover: async prepared => {
      if (controls.recoveryError) throw new Error('Simulated RPC outage');
      return completed.get(prepared.extrinsicHash) ?? { status: controls.expire ? 'expired' : 'pending' };
    },
    submitAndFinalize: async prepared => {
      const [saved] = await sql`SELECT * FROM polkadot_anchor_attempts WHERE extrinsic_hash = ${prepared.extrinsicHash}`;
      assert.equal(saved.status, 'broadcast', 'exact transaction must be committed before network submission');
      assert.equal(saved.signed_extrinsic_hex, prepared.signedHex);
      submissions++; submittedHashes.push(prepared.extrinsicHash);
      if (controls.rejectBeforeInclusion) { controls.rejectBeforeInclusion = false; throw new Error('Ambiguous submission transport failure'); }
      if (controls.expire) return { status: 'expired' };
      const result = { status: 'finalized', extrinsicHash: prepared.extrinsicHash,
        blockHash: `0x${sha256(`block-${submissions}`)}`, blockNumber: String(200 + submissions),
        blockTimestamp: new Date().toISOString(), extrinsicIndex: 1, eventIndex: 3,
        finalizedHeadHash: `0x${sha256('head')}`, feePaidPlanck: '11900000' };
      completed.set(prepared.extrinsicHash, result); nonce++;
      if (controls.crashAfterInclusion) { controls.crashAfterInclusion = false; throw new Error('Crash after inclusion before DB confirmation'); }
      return result;
    },
    verifyFinalizedCommitment: async () => { previousChecks++; return { status: 'finalized' }; },
    stats: () => ({ prepares, submissions, submittedHashes, previousChecks }),
  };
}
const run = (sql, chain, extra = {}) => runAnchoring({ sql, chain, seedHex: 'public-test-placeholder', log: () => {}, ...extra });

test('fee configuration refuses loosening the operator ceilings', () => {
  assert.equal(workerConfig({}).maxFeePlanck, 50000000n);
  assert.throws(() => workerConfig({ ANCHOR_MAX_FEE_PLANCK: '50000001' }), /INVALID_LIMIT/);
  assert.throws(() => workerConfig({ ANCHOR_MIN_BALANCE_PLANCK: '100000000' }), /RESERVE_TOO_LOW/);
  assert.throws(() => workerConfig({ ANCHOR_ANNUAL_FEE_LIMIT_PLANCK: '20000000001' }), /INVALID_LIMIT/);
});

dbTest('dry run leaves no outbox; finalized batches become immutable and new receipts link to prior root', async sql => {
  const source = await fixture(sql);
  const chain = fakeChain(sql);
  assert.equal((await run(sql, chain, { dryRun: true })).receiptCount, 3);
  assert.equal((await sql`SELECT count(*)::int AS n FROM polkadot_anchor_batches`)[0].n, 0);
  const result = await run(sql, chain);
  assert.equal(result.status, 'complete');
  assert.equal((await run(sql, chain)).status, 'idle');
  assert.equal(chain.stats().submissions, 1);
  const [first] = await sql`SELECT * FROM polkadot_anchor_batches`;
  assert.equal(first.status, 'finalized');
  assert.equal((await sql`SELECT count(*)::int AS n FROM polkadot_anchor_memberships`)[0].n, 3);
  await assert.rejects(sql`UPDATE polkadot_anchor_batches SET root_sha256 = ${'0'.repeat(64)}`, /immutable/);
  await assert.rejects(sql`DELETE FROM polkadot_anchor_memberships`, /append-only/);
  await source.add();
  const next = await run(sql, chain);
  assert.equal(next.status, 'complete');
  const [second] = await sql`SELECT * FROM polkadot_anchor_batches WHERE id = ${next.batchId}`;
  assert.equal(second.previous_root_sha256, first.root_sha256);
  assert.equal(second.receipt_count, 1);
  assert.equal(chain.stats().previousChecks, 1);
});

dbTest('crash after finalized inclusion recovers without another signature or submission', async sql => {
  await fixture(sql);
  const chain = fakeChain(sql, { crashAfterInclusion: true });
  await assert.rejects(run(sql, chain), /Crash after inclusion/);
  assert.equal((await sql`SELECT status FROM polkadot_anchor_batches`)[0].status, 'pending');
  assert.equal((await run(sql, chain)).status, 'complete');
  assert.deepEqual({ prepares: chain.stats().prepares, submissions: chain.stats().submissions }, { prepares: 1, submissions: 1 });
});

dbTest('ambiguous submission retries exactly the saved bytes and does not sign again', async sql => {
  await fixture(sql);
  const controls = { rejectBeforeInclusion: true };
  const chain = fakeChain(sql, controls);
  await assert.rejects(run(sql, chain), /Ambiguous submission/);
  assert.equal((await run(sql, chain)).status, 'complete');
  assert.equal(chain.stats().prepares, 1);
  assert.equal(new Set(chain.stats().submittedHashes).size, 1);
});

dbTest('an unavailable recovery RPC cannot cause a replacement signature', async sql => {
  await fixture(sql);
  const controls = { rejectBeforeInclusion: true };
  const chain = fakeChain(sql, controls);
  await assert.rejects(run(sql, chain));
  controls.recoveryError = true;
  await assert.rejects(run(sql, chain), /RPC outage/);
  assert.equal(chain.stats().prepares, 1);
  assert.equal(chain.stats().submissions, 1);
});

dbTest('expired attempts stop at the daily budget while keeping the batch recoverable', async sql => {
  await fixture(sql);
  const chain = fakeChain(sql, { expire: true });
  for (let n = 0; n < 3; n++) assert.equal((await run(sql, chain)).status, 'pending');
  await assert.rejects(run(sql, chain), /DAILY_ATTEMPT_LIMIT/);
  assert.equal(chain.stats().prepares, 3);
  assert.equal((await sql`SELECT count(*)::int AS n FROM polkadot_anchor_batches`)[0].n, 1);
});

dbTest('broken receipt history and insufficient reserve cannot reach signing', async sql => {
  const source = await fixture(sql, 1);
  const low = fakeChain(sql, { balance: '10000000001' });
  await assert.rejects(run(sql, low), /BALANCE_RESERVE/);
  assert.equal(low.stats().prepares, 0);
  const chain = fakeChain(sql);
  await run(sql, chain);
  await source.add({ previousReceiptSha256: 'f'.repeat(64) });
  await assert.rejects(run(sql, chain), /RECEIPT_HISTORY_MISMATCH/);
  assert.equal(chain.stats().prepares, 1);
});

dbTest('concurrent invocation returns busy without accessing the chain', async sql => {
  const connection = await sql.reserve();
  await connection`SELECT pg_advisory_lock(1203217642)`;
  try {
    assert.equal((await run(sql, { readState() { throw new Error('must not access chain'); } })).status, 'busy');
  } finally { await connection`SELECT pg_advisory_unlock(1203217642)`; connection.release(); }
});

dbTest('annual fee reserve and an untracked on-chain nonce stop new signatures', async sql => {
  const source = await fixture(sql, 1);
  const unexpected = fakeChain(sql, { nonce: 1 });
  await assert.rejects(run(sql, unexpected), /UNTRACKED_SIGNER_NONCE/);
  assert.equal(unexpected.stats().prepares, 0);
  const chain = fakeChain(sql);
  const config = workerConfig({ ANCHOR_ANNUAL_FEE_LIMIT_PLANCK: '50000000' });
  assert.equal((await run(sql, chain, { config })).status, 'complete');
  await source.add();
  await assert.rejects(run(sql, chain, { config }), /ANNUAL_FEE_LIMIT/);
  assert.equal(chain.stats().prepares, 1);
});
