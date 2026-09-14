import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import postgres from 'postgres';
import { runAnchoring, workerConfig, selectRationaleBatch } from './worker.mjs';
import { POLKADOT_GENESIS_HASH, POLKADOT_SIGNER_ADDRESS, sha256, parseEnvelope, buildEnvelope,
  createMerkleTree, buildManifest, MAX_ANCHOR_PAYLOAD_BYTES, receiptRationale } from './proofs.mjs';
import { anchorPolicy, validateOneTimeApproval } from './one-time-approval.mjs';

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
  const sourceUrl = `https://example.org/fixture/${bookId}`;
  await sql`INSERT INTO books(id,title,author) VALUES(${bookId},'Fixture','Test')`;
  await sql`INSERT INTO editions(id,book_id,source_url,source_sha256,normalized_sha256,rights_basis,retrieved_at)
    VALUES(${editionId},${bookId},${sourceUrl},${hash},${hash},'test',now())`;
  await sql`INSERT INTO corpus_publication_approvals(edition_id,book_id,source_sha256,normalized_sha256,source_url)
    VALUES(${editionId},${bookId},${hash},${hash},${sourceUrl})`;
  await sql`INSERT INTO chapters(id,edition_id,chapter_index) VALUES(${chapterId},${editionId},0)`;
  await sql`INSERT INTO edition_sources(edition_id,source_sha256,normalized_sha256,normalization_version,original_bytes,normalized_chapters)
    VALUES(${editionId},${hash},${hash},'1',${content},'[]'::jsonb)`;
  await sql`INSERT INTO passages(id,book_id,edition_id,chapter_id,exact_text,source_start,source_end,word_count,status,published_at)
    VALUES(${passageId},${bookId},${editionId},${chapterId},'A fixture passage.',0,18,3,'published',now())`;
  let previous = null;
  const add = async (overrides = {}) => {
    const body = JSON.stringify({ schemaVersion: '1.0', passageId, previousReceiptSha256: previous,
      action: 'published', testEvent: randomUUID(), selection: { reason: 'A useful lesson about curiosity, evidence and learning 🌟.' }, ...overrides });
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
  const fee = payloadHex => controls.oneTimeApproval?.envelopeHex === payloadHex
    ? String(controls.exceptionFee ?? '1000000000')
    : String(controls.feePerReceipt ? parseEnvelope(payloadHex).receiptCount * controls.feePerReceipt : 12000000);
  return {
    readState: async () => state(),
    estimateFee: async ({ payloadHex }) => {
      if (controls.quoteError) throw new Error('Fee quote unavailable');
      return { estimatedFeePlanck: fee(payloadHex) };
    },
    prepare: async ({ payloadHex, maxFeePlanck = '50000000', minBalancePlanck = '10000000000' }) => {
      prepares++;
      const policy = anchorPolicy(payloadHex, controls.oneTimeApproval);
      return { kind: 'good-doomscroller-polkadot-anchor', schemaVersion: 1,
        genesisHash: POLKADOT_GENESIS_HASH, signerAddress: POLKADOT_SIGNER_ADDRESS,
        payloadHex, signedHex: `0x${sha256(`signed-${prepares}`)}`,
        extrinsicHash: `0x${sha256(`tx-${prepares}`)}`, nonce: String(nonce),
        eraBirth: 100 + prepares, eraDeath: 164 + prepares, estimatedFeePlanck: fee(payloadHex),
        maxFeePlanck, minBalancePlanck,
        ...(policy.oneTimeApprovalId ? { oneTimeApprovalId: policy.oneTimeApprovalId,
          oneTimeApprovalSha256: policy.oneTimeApprovalSha256 } : {}) };
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
        finalizedHeadHash: `0x${sha256('head')}`, feePaidPlanck: controls.omitActualFee ? null : fee(prepared.payloadHex) };
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
  assert.throws(() => workerConfig({ MAX_DAILY_ATTEMPTS: '4' }), /INVALID_LIMIT/);
  assert.throws(() => workerConfig({ ANCHOR_MAX_PAYLOAD_BYTES: String(MAX_ANCHOR_PAYLOAD_BYTES + 1) }), /INVALID_LIMIT/);
});

async function approvalFixture(sql, passageId, edits = {}) {
  const rows = await sql`SELECT sequence, receipt_json, receipt_sha256 FROM passage_verification_receipts
    WHERE passage_id = ${passageId}::uuid ORDER BY sequence`;
  const receipts = rows.map(row => ({ sequence: String(row.sequence), ...receiptRationale({ receiptJson: row.receipt_json, receiptSha256: row.receipt_sha256 }) }));
  const tree = createMerkleTree(receipts), batchId = randomUUID();
  const envelopeHex = buildEnvelope({ batchId, receiptCount: receipts.length, rootSha256: tree.rootSha256,
    previousRootSha256: null, rationaleEntries: receipts });
  const input = { schemaVersion: '1.0', approvalId: 'rationales-2026-09-13', selectionArtifactSha256: 'f'.repeat(64),
    batchId, previousBatchId: null, previousRootSha256: null, genesisHash: POLKADOT_GENESIS_HASH,
    signerAddress: POLKADOT_SIGNER_ADDRESS, maxFeePlanck: '12800000000', maxPayloadBytes: MAX_ANCHOR_PAYLOAD_BYTES,
    receipts, envelopeHex, envelopeSha256: sha256(Buffer.from(envelopeHex.slice(2), 'hex')), payloadBytes: (envelopeHex.length - 2) / 2, ...edits };
  const json = JSON.stringify(input);
  return validateOneTimeApproval(json, sha256(json));
}

dbTest('one-time approval anchors only the explicit scope, consumes one attempt and leaves ordinary limits intact', async sql => {
  const unrelated = await fixture(sql, 1), source = await fixture(sql, 2);
  const oneTimeApproval = await approvalFixture(sql, source.passageId);
  const chain = fakeChain(sql, { oneTimeApproval });
  const options = { oneTimeApproval, oneTime: true };
  const preview = await run(sql, chain, { ...options, dryRun: true });
  assert.equal(preview.maximumFeePlanck, '12800000000');
  assert.equal(chain.stats().prepares, 0, 'dry run must never sign');
  assert.equal((await run(sql, chain, options)).receiptCount, 2);
  assert.equal((await run(sql, chain, options)).status, 'already_complete');
  assert.equal(chain.stats().prepares, 1);
  const [attempt] = await sql`SELECT * FROM polkadot_anchor_attempts`;
  assert.equal(attempt.prepared_json.oneTimeApprovalSha256, oneTimeApproval.approvalSha256);
  assert.equal(attempt.prepared_json.maxFeePlanck, '12800000000');
  assert.equal((await sql`SELECT count(*)::int AS n FROM polkadot_anchor_memberships m JOIN passage_verification_receipts r
    ON r.sequence=m.receipt_sequence WHERE r.passage_id=${unrelated.passageId}::uuid`)[0].n, 0);
  assert.equal((await run(sql, chain, { oneTimeApproval })).receiptCount, 1);
  const [normal] = await sql`SELECT prepared_json FROM polkadot_anchor_attempts WHERE id <> ${attempt.id}::uuid`;
  assert.equal(normal.prepared_json.maxFeePlanck, '50000000');
  assert.equal(normal.prepared_json.oneTimeApprovalId, undefined);
  const duplicate = { ...attempt.prepared_json, extrinsicHash: '0x' + 'd'.repeat(64) };
  await assert.rejects(sql`INSERT INTO polkadot_anchor_attempts(id,batch_id,extrinsic_hash,signed_extrinsic_hex,prepared_json,nonce,era_birth,era_death,estimated_fee_planck)
    VALUES(${randomUUID()},${attempt.batch_id},${duplicate.extrinsicHash},${attempt.signed_extrinsic_hex},${sql.json(duplicate)},9,100,164,1000)`, /duplicate key/);
  await assert.rejects(sql`INSERT INTO polkadot_anchor_attempts(id,batch_id,extrinsic_hash,signed_extrinsic_hex,prepared_json,nonce,era_birth,era_death,estimated_fee_planck)
    VALUES(${randomUUID()},${attempt.batch_id},${'0x' + 'e'.repeat(64)},'0x00',${sql.json({ oneTimeApprovalId: null, oneTimeApprovalSha256: null })},9,100,164,1000)`, /check constraint/);
});

dbTest('one-time ambiguous transport and finalized crashes recover exact saved bytes without another signature', async sql => {
  const source = await fixture(sql, 2), oneTimeApproval = await approvalFixture(sql, source.passageId);
  const controls = { oneTimeApproval, rejectBeforeInclusion: true, crashAfterInclusion: true }, chain = fakeChain(sql, controls);
  await assert.rejects(run(sql, chain, { oneTimeApproval, oneTime: true }), /Ambiguous/);
  await assert.rejects(run(sql, chain, { oneTimeApproval }), /Crash after inclusion/);
  assert.equal((await run(sql, chain, { oneTimeApproval })).status, 'complete');
  assert.equal(chain.stats().prepares, 1);
  assert.equal(new Set(chain.stats().submittedHashes).size, 1);
  assert.equal((await sql`SELECT count(*)::int AS n FROM polkadot_anchor_attempts`)[0].n, 1);
});

dbTest('one-time expired attempts are terminal and cannot be replaced by explicit or scheduled reruns', async sql => {
  const source = await fixture(sql, 2), oneTimeApproval = await approvalFixture(sql, source.passageId);
  const chain = fakeChain(sql, { oneTimeApproval, expire: true });
  await assert.rejects(run(sql, chain, { oneTimeApproval, oneTime: true }), /ONE_TIME_APPROVAL_EXPIRED/);
  await assert.rejects(run(sql, chain, { oneTimeApproval, oneTime: true }), /ONE_TIME_APPROVAL_EXPIRED/);
  await assert.rejects(run(sql, chain, { oneTimeApproval }), /ONE_TIME_APPROVAL_EXPIRED/);
  assert.equal(chain.stats().prepares, 1);
  assert.equal((await sql`SELECT count(*)::int AS n FROM polkadot_anchor_attempts`)[0].n, 1);
});

dbTest('one-time full fee, reserve and annual ceilings reject before signing without shrinking approved scope', async sql => {
  const source = await fixture(sql, 2), oneTimeApproval = await approvalFixture(sql, source.passageId);
  const expensive = fakeChain(sql, { oneTimeApproval, exceptionFee: '12800000001' });
  await assert.rejects(run(sql, expensive, { oneTimeApproval, oneTime: true }), /ONE_TIME_FEE_LIMIT/);
  assert.equal((await sql`SELECT count(*)::int AS n FROM polkadot_anchor_batches`)[0].n, 0);
  const low = fakeChain(sql, { oneTimeApproval, balance: '22799999999' });
  await assert.rejects(run(sql, low, { oneTimeApproval, oneTime: true }), /BALANCE_RESERVE/);
  assert.equal(low.stats().prepares, 0);
  const chain = fakeChain(sql, { oneTimeApproval });
  const config = workerConfig({ ANCHOR_ANNUAL_FEE_LIMIT_PLANCK: '12799999999' });
  await assert.rejects(run(sql, chain, { oneTimeApproval, oneTime: true, config }), /ANNUAL_FEE_LIMIT/);
  await assert.rejects(run(sql, chain, { oneTimeApproval }), /ONE_TIME_MODE_REQUIRED/);
  assert.equal(chain.stats().prepares, 0);
});

dbTest('unknown actual exception fees reserve the saved approved maximum after normal settings resume', async sql => {
  const source = await fixture(sql, 1), oneTimeApproval = await approvalFixture(sql, source.passageId);
  const chain = fakeChain(sql, { oneTimeApproval, omitActualFee: true });
  await run(sql, chain, { oneTimeApproval, oneTime: true });
  await source.add();
  const config = workerConfig({ ANCHOR_ANNUAL_FEE_LIMIT_PLANCK: '12849999999' });
  await assert.rejects(run(sql, chain, { oneTimeApproval, config }), /ANNUAL_FEE_LIMIT/);
  assert.equal(chain.stats().prepares, 1);
});

dbTest('one-time approval cannot absorb unrelated pending batches or a changed predecessor', async sql => {
  const unrelated = await fixture(sql, 1), source = await fixture(sql, 1);
  const oneTimeApproval = await approvalFixture(sql, source.passageId);
  const controls = { oneTimeApproval, rejectBeforeInclusion: true }, chain = fakeChain(sql, controls);
  await assert.rejects(run(sql, chain, { config: workerConfig({ ANCHOR_MAX_PAYLOAD_BYTES: '400' }) }), /Ambiguous/);
  await assert.rejects(run(sql, chain, { oneTimeApproval, oneTime: true }), /UNRELATED_PENDING_BATCH/);
  await run(sql, chain);
  await assert.rejects(run(sql, chain, { oneTimeApproval, oneTime: true }), /ONE_TIME_PREDECESSOR_DRIFT/);
  assert.equal(chain.stats().prepares, 1);
  assert.ok(unrelated.passageId);
});

test('byte-bounded selection takes the longest ordered UTF-8 prefix and keeps older timestamps absent', () => {
  const rows = Array.from({ length: 10 }, (_, index) => {
    const receipt_json = JSON.stringify({ schemaVersion: '1.0', passageId: 'a73cc6ee-f313-440b-a5f8-84ff7fd8db56',
      index, selection: { reason: 'A reason with café, 世界 and 🌟.' } });
    return { sequence: String(index + 1), receipt_json, receipt_sha256: sha256(receipt_json) };
  });
  const all = selectRationaleBatch(rows);
  const cap = 96 + Buffer.byteLength(JSON.stringify(all.rationaleEntries.slice(0, 3)));
  const selected = selectRationaleBatch(rows, cap);
  assert.deepEqual(selected.rows, rows.slice(0, 3));
  assert.equal(Object.hasOwn(selected.rationaleEntries[0].selection, 'selectionRecordedAt'), false);
  assert.equal(selectRationaleBatch(rows, cap - 1).rows.length, 2);
  assert.throws(() => selectRationaleBatch(rows, 98), /PAYLOAD_TOO_LARGE/);
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
  assert.equal(parseEnvelope(first.envelope_hex).version, 2);
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

dbTest('new batches select the largest fee-fitting prefix before persistence and retain the remainder', async sql => {
  await fixture(sql, 7);
  const chain = fakeChain(sql, { feePerReceipt: 10000000 });
  const result = await run(sql, chain);
  assert.equal(result.receiptCount, 5);
  const [batch] = await sql`SELECT * FROM polkadot_anchor_batches`;
  assert.equal(parseEnvelope(batch.envelope_hex).rationaleEntries.length, 5);
  assert.equal((await sql`SELECT count(*)::int AS n FROM polkadot_anchor_memberships`)[0].n, 5);
  const next = await run(sql, chain);
  assert.equal(next.receiptCount, 2);
  assert.equal(chain.stats().prepares, 2);
});

dbTest('unaffordable single reasons or unavailable fee quotes leave no immutable pending batch or attempt', async sql => {
  await fixture(sql, 2);
  const chain = fakeChain(sql, { feePerReceipt: 50000001 });
  await assert.rejects(run(sql, chain), /SINGLE_RATIONALE_FEE_LIMIT/);
  assert.equal(chain.stats().prepares, 0);
  const unavailable = fakeChain(sql, { quoteError: true });
  await assert.rejects(run(sql, unavailable), /Fee quote unavailable/);
  assert.equal((await sql`SELECT count(*)::int AS n FROM polkadot_anchor_batches`)[0].n, 0);
  assert.equal((await sql`SELECT count(*)::int AS n FROM polkadot_anchor_attempts`)[0].n, 0);
});

dbTest('migration accepts legacy and v2 framing and rejects malformed bytes or altered header identities', async sql => {
  await fixture(sql, 1);
  await run(sql, fakeChain(sql));
  const [batch] = await sql`SELECT * FROM polkadot_anchor_batches`;
  const envelope = parseEnvelope(batch.envelope_hex);
  const check = async hex => (await sql`SELECT valid_anchor_envelope(${hex},${batch.id}::uuid,${batch.receipt_count},${batch.root_sha256},${'0'.repeat(64)}) AS valid`)[0].valid;
  assert.equal(await check(batch.envelope_hex), true);
  assert.equal(await check(buildEnvelope({ ...envelope, rationaleEntries: undefined })), true);
  assert.equal(await check(batch.envelope_hex + '00'), false);
  assert.equal(await check(batch.envelope_hex.slice(0, -2)), false);
  const wrongId = Buffer.from(batch.envelope_hex.slice(2), 'hex'); wrongId[8] ^= 1;
  assert.equal(await check('0x' + wrongId.toString('hex')), false);
  const wrongLength = Buffer.from(batch.envelope_hex.slice(2), 'hex'); wrongLength.writeUInt32BE(2, 92);
  assert.equal(await check('0x' + wrongLength.toString('hex')), false);
  const wrongUtf8 = Buffer.from(batch.envelope_hex.slice(2), 'hex'); wrongUtf8[100] = 0xff;
  assert.equal(await check('0x' + wrongUtf8.toString('hex')), false);
  await assert.rejects(sql`UPDATE polkadot_anchor_batches SET envelope_hex = ${buildEnvelope({ ...envelope, rationaleEntries: undefined })}`, /immutable/);
});

dbTest('a persisted v1 attempt resumes its exact transaction after upgrade and a v2 successor verifies it', async sql => {
  const source = await fixture(sql, 2);
  const rows = await sql`SELECT sequence, receipt_sha256 FROM passage_verification_receipts ORDER BY sequence`;
  const receipts = rows.map(row => ({ sequence: String(row.sequence), receiptSha256: row.receipt_sha256 }));
  const tree = createMerkleTree(receipts), id = randomUUID();
  const envelope = buildEnvelope({ batchId: id, receiptCount: 2, rootSha256: tree.rootSha256, previousRootSha256: null });
  await sql`INSERT INTO polkadot_anchor_batches ${sql({ id, previous_batch_id: null, previous_root_sha256: null,
    root_sha256: tree.rootSha256, receipt_count: 2, first_receipt_sequence: receipts[0].sequence, last_receipt_sequence: receipts[1].sequence,
    manifest_json: buildManifest({ batchId: id, previousBatchId: null, previousRootSha256: null, receipts }),
    envelope_hex: envelope, genesis_hash: POLKADOT_GENESIS_HASH, signer_address: POLKADOT_SIGNER_ADDRESS })}`;
  for (let index = 0; index < receipts.length; index++) await sql`INSERT INTO polkadot_anchor_memberships ${sql({
    batch_id: id, receipt_sequence: receipts[index].sequence, receipt_sha256: receipts[index].receiptSha256,
    leaf_index: index, proof: sql.json(tree.proofs[index]),
  })}`;
  const controls = { quoteError: true }, chain = fakeChain(sql, controls);
  const prepared = await chain.prepare({ payloadHex: envelope });
  await sql`INSERT INTO polkadot_anchor_attempts ${sql({ id: randomUUID(), batch_id: id,
    extrinsic_hash: prepared.extrinsicHash, signed_extrinsic_hex: prepared.signedHex, prepared_json: sql.json(prepared),
    nonce: prepared.nonce, era_birth: prepared.eraBirth, era_death: prepared.eraDeath,
    estimated_fee_planck: prepared.estimatedFeePlanck, status: 'prepared' })}`;
  assert.equal((await run(sql, chain)).status, 'complete');
  assert.equal(chain.stats().prepares, 1);
  assert.equal((await sql`SELECT envelope_hex FROM polkadot_anchor_batches`)[0].envelope_hex, envelope);
  controls.quoteError = false;
  await source.add();
  const next = await run(sql, chain);
  const [batch] = await sql`SELECT * FROM polkadot_anchor_batches WHERE id = ${next.batchId}`;
  assert.equal(parseEnvelope(batch.envelope_hex).version, 2);
  assert.equal(batch.previous_root_sha256, tree.rootSha256);
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

dbTest('withdrawn receipts are skipped in normal batches and rejected from an approved one-time scope', async sql => {
  const withdrawn = await fixture(sql, 1);
  const oneTimeApproval = await approvalFixture(sql, withdrawn.passageId);
  const retained = await fixture(sql, 1);
  await sql`UPDATE passages SET status='archived', published_at=NULL WHERE id=${withdrawn.passageId}::uuid`;
  const chain = fakeChain(sql, { oneTimeApproval });
  await assert.rejects(run(sql, chain, { oneTimeApproval, oneTime: true }), /ONE_TIME_RECEIPT_SCOPE_DRIFT/);
  assert.equal(chain.stats().prepares, 0);
  const result = await run(sql, chain);
  assert.equal(result.receiptCount, 1);
  const members = await sql`SELECT r.passage_id FROM polkadot_anchor_memberships m
    JOIN passage_verification_receipts r ON r.sequence=m.receipt_sequence`;
  assert.deepEqual(members.map(row => row.passage_id), [retained.passageId]);
});
