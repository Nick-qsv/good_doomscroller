import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Metadata, TypeRegistry } from '@polkadot/types';
import { Keyring } from '@polkadot/keyring';
import { blake2AsHex, cryptoWaitReady } from '@polkadot/util-crypto';
import {
  HUB_GENESIS_HASH, HUB_SIGNER_ADDRESS, V0_EXTENSIONS, configureV0Registry, createChainClient, encodeRuntimeValidation, inspectAnchorEvents,
  inspectSignedAnchor, validateAnchorPayload, validatePreparedRecord,
} from './chain.mjs';
import { buildEnvelope, createMerkleTree, sha256 } from './proofs.mjs';
import { validateOneTimeApproval } from './one-time-approval.mjs';

await cryptoWaitReady();
const metadataFixture = JSON.parse(readFileSync(new URL('./fixtures/hub-v2005000-minimal.json', import.meta.url)));
function commitment() {
  const bytes = Buffer.alloc(92, 17);
  bytes.write('GDSANCH1'); bytes.writeUInt32BE(4, 24);
  return `0x${bytes.toString('hex')}`;
}
function fixture(payloadHex = commitment()) {
  const registry = new TypeRegistry();
  const metadata = new Metadata(registry, metadataFixture);
  registry.setMetadata(metadata, [], {}, true);
  configureV0Registry(registry, metadata);
  // Public test vector. This well-known artificial key is never funded or used live.
  const pair = new Keyring({ type: 'sr25519', ss58Format: 0 }).addFromSeed(new Uint8Array(32).fill(1));
  const call = registry.createType('Call', { callIndex: [0, 7], args: [payloadHex] });
  const tx = registry.createType('Extrinsic', call, { version: 4 });
  const options = {
    nonce: 0, tip: 0, era: { current: 20579677, period: 64 }, genesisHash: HUB_GENESIS_HASH,
    blockHash: `0x${'12'.repeat(32)}`, runtimeVersion: { specVersion: 2005000, transactionVersion: 15 },
    mode: 0, metadataHash: null, assetId: null,
  };
  tx.sign(pair, options);
  const prepared = {
    kind: 'good-doomscroller-polkadot-anchor', schemaVersion: 1, genesisHash: HUB_GENESIS_HASH,
    signerAddress: pair.address, payloadHex, signedHex: tx.toHex(), extrinsicHash: tx.hash.toHex(),
    nonce: '0', checkpointHash: options.blockHash, checkpointNumber: 20579677, eraBirth: 20579677, eraDeath: 20579741,
    specVersion: 2005000, transactionVersion: 15, estimatedFeePlanck: '11386503', maxFeePlanck: '50000000', minBalancePlanck: '10000000000',
  };
  return { registry, metadata, prepared, pair, tx, api: { tx: (hex) => registry.createType('Extrinsic', hex) } };
}

function approvalFixture() {
  const batchId = '01234567-89ab-cdef-0123-456789abcdef';
  const receiptSha256 = sha256('public approved receipt');
  const receipts = [{ sequence: '1', receiptSha256, passageId: 'a73cc6ee-f313-440b-a5f8-84ff7fd8db56',
    selection: { reason: 'A public lesson about curiosity and learning.' } }];
  const envelopeHex = buildEnvelope({ batchId, receiptCount: 1, previousRootSha256: null,
    rootSha256: createMerkleTree(receipts).rootSha256,
    rationaleEntries: receipts.map(({ sequence, ...entry }) => entry) });
  const envelopeBytes = Buffer.from(envelopeHex.slice(2), 'hex');
  const json = JSON.stringify({ schemaVersion: '1.0', approvalId: 'rationales-2026-09-13',
    selectionArtifactSha256: sha256('public source artifact'), batchId, previousBatchId: null, previousRootSha256: null,
    genesisHash: HUB_GENESIS_HASH, signerAddress: HUB_SIGNER_ADDRESS,
    maxFeePlanck: '12800000000', maxPayloadBytes: 131072, receipts, envelopeHex,
    envelopeSha256: sha256(envelopeBytes), payloadBytes: envelopeBytes.length });
  return validateOneTimeApproval(json, sha256(json));
}

test('only canonical nonempty v1 or bounded v2 history commitments may be signed', () => {
  assert.equal(validateAnchorPayload(commitment()), commitment());
  assert.throws(() => validateAnchorPayload('0x1234'), /92-byte/);
  const empty = Buffer.from(commitment().slice(2), 'hex'); empty.writeUInt32BE(0, 24);
  assert.throws(() => validateAnchorPayload(empty), /receipt count/);
  empty.write('TRANSFER'); assert.throws(() => validateAnchorPayload(empty), /92-byte/);
});

test('v2 signed public test vector round-trips beyond the former fixed-size transaction limit', () => {
  const receiptSha256 = sha256('public fixture');
  const payloadHex = buildEnvelope({ batchId: '01234567-89ab-cdef-0123-456789abcdef', receiptCount: 1,
    previousRootSha256: null, rootSha256: createMerkleTree([{ sequence: '1', receiptSha256 }]).rootSha256,
    rationaleEntries: [{ receiptSha256, passageId: 'a73cc6ee-f313-440b-a5f8-84ff7fd8db56', selection: { reason: 'Curiosity 🌟. '.repeat(200) } }] });
  const { api, prepared } = fixture(payloadHex);
  assert.ok(prepared.signedHex.length > 2048);
  assert.equal(validateAnchorPayload(payloadHex), payloadHex);
  validatePreparedRecord(prepared, { signerAddress: prepared.signerAddress });
  assert.equal(inspectSignedAnchor(api, prepared).hash.toHex(), prepared.extrinsicHash);
});

test('runtime v16 selects frozen v0, excluding the materially different v1 pipeline', () => {
  const { registry, metadata } = fixture();
  assert.equal(metadata.version, 16);
  assert.ok(metadata.asLatest.extrinsic.transactionExtensions.some((extension) => extension.identifier.toString() === 'VerifyMultiSignature'));
  assert.deepEqual(registry.signedExtensions, [...V0_EXTENSIONS]);
});

test('unreviewed extension versions or nonempty extension fields stop signing', () => {
  const { registry } = fixture();
  const changed = structuredClone(metadataFixture);
  changed.metadata.v16.extrinsic.transactionExtensionsByVersion['0'].push(13);
  assert.throws(() => configureV0Registry(registry, new Metadata(registry, changed)), /pipeline v0 changed/);
  const changedType = structuredClone(metadataFixture);
  changedType.metadata.v16.extrinsic.transactionExtensions[0].type = 103; // bool, previously zero-byte Null.
  assert.throws(() => configureV0Registry(registry, new Metadata(registry, changedType)), /shape changed/);
});

test('public test-vector v4 signature, nonce, era, fee asset, call and payload round-trip', () => {
  const { api, prepared, tx } = fixture();
  validatePreparedRecord(prepared, { signerAddress: prepared.signerAddress });
  assert.equal(inspectSignedAnchor(api, prepared).hash.toHex(), prepared.extrinsicHash);
  assert.equal(tx.encodedLength, 203);
});

test('runtime validation preserves the existing SCALE extrinsic length prefix', () => {
  const { prepared } = fixture();
  const encoded = encodeRuntimeValidation(prepared.signedHex, prepared.checkpointHash);
  assert.equal(encoded, `0x02${prepared.signedHex.slice(2)}${prepared.checkpointHash.slice(2)}`);
  assert.equal(Buffer.from(encoded.slice(2), 'hex').length, 1 + 203 + 32);
});

test('persisted records cannot redirect the chain, sender, payload, nonce or fee guardrails', () => {
  const { api, prepared } = fixture();
  const validate = (value) => validatePreparedRecord(value, { signerAddress: prepared.signerAddress });
  assert.throws(() => validate({ ...prepared, genesisHash: `0x${'00'.repeat(32)}` }), /another chain/);
  assert.throws(() => validate({ ...prepared, maxFeePlanck: '50000001' }), /fee limit/);
  assert.throws(() => validate({ ...prepared, minBalancePlanck: '9999999999' }), /reserve/);
  assert.throws(() => validate({ ...prepared, eraDeath: prepared.eraDeath + 64 }), /mortal anchor era/);
  assert.throws(() => inspectSignedAnchor(api, { ...prepared, nonce: '1' }), /nonce\/tip/);
  const changed = Buffer.from(prepared.payloadHex.slice(2), 'hex'); changed[40] ^= 1;
  assert.throws(() => inspectSignedAnchor(api, { ...prepared, payloadHex: `0x${changed.toString('hex')}` }), /payload mismatch/);
  assert.throws(() => inspectSignedAnchor(api, { ...prepared, checkpointHash: `0x${'34'.repeat(32)}` }), /signature is invalid/);
  assert.throws(() => inspectSignedAnchor(api, { ...prepared, transactionVersion: 16 }), /signature is invalid/);
});

test('elevated saved fee policy requires the exact payload and markers from a trusted approval', () => {
  const approval = approvalFixture();
  // This test validates outbox metadata only; signature verification remains a
  // separate mandatory step and uses the artificial public vector in other tests.
  const prepared = { ...fixture(approval.envelopeHex).prepared, signerAddress: HUB_SIGNER_ADDRESS,
    estimatedFeePlanck: '10596636503', maxFeePlanck: '12800000000',
    oneTimeApprovalId: approval.approvalId, oneTimeApprovalSha256: approval.approvalSha256 };
  const config = { oneTimeApproval: approval };
  assert.equal(validatePreparedRecord(prepared, config), prepared);
  assert.throws(() => validatePreparedRecord(prepared), /trusted authorization/);
  assert.throws(() => validatePreparedRecord(prepared, { oneTimeApproval: { ...approval } }), /independently validated/);
  assert.throws(() => validatePreparedRecord({ ...prepared, maxFeePlanck: '12800000001' }, config), /fee limit/);
  assert.throws(() => validatePreparedRecord({ ...prepared, estimatedFeePlanck: '12800000001' }, config), /estimated fee/);
  assert.throws(() => validatePreparedRecord({ ...prepared, estimatedFeePlanck: '0' }, config), /estimated fee/);
  assert.throws(() => validatePreparedRecord({ ...prepared, oneTimeApprovalId: 'unapproved-operation' }, config), /trusted authorization/);
  assert.throws(() => validatePreparedRecord({ ...prepared, oneTimeApprovalSha256: sha256('changed approval') }, config), /trusted authorization/);
  const { oneTimeApprovalId, oneTimeApprovalSha256, ...unmarked } = prepared;
  assert.throws(() => validatePreparedRecord(unmarked, config), /trusted authorization/);
  assert.throws(() => validatePreparedRecord({ ...prepared, payloadHex: commitment() }, config), /trusted authorization/);
  assert.throws(() => validatePreparedRecord({ ...prepared, signerAddress: fixture().pair.address },
    { ...config, signerAddress: fixture().pair.address }), /another chain or signer/);
});

test('ordinary payloads retain the normal fee cap with or without an unrelated approval', () => {
  const { prepared } = fixture();
  const approval = approvalFixture();
  for (const oneTimeApproval of [undefined, approval]) {
    const config = { signerAddress: prepared.signerAddress, oneTimeApproval };
    assert.equal(validatePreparedRecord(prepared, config), prepared);
    assert.throws(() => validatePreparedRecord({ ...prepared, maxFeePlanck: '50000001' }, config), /fee limit/);
    assert.throws(() => validatePreparedRecord({ ...prepared, oneTimeApprovalId: approval.approvalId }, config), /trusted authorization/);
    assert.throws(() => validatePreparedRecord({ ...prepared, oneTimeApprovalSha256: approval.approvalSha256 }, config), /trusted authorization/);
  }
});

function eventRecord(section, method, data, index = 2) {
  return { phase: { isApplyExtrinsic: true, asApplyExtrinsic: { toNumber: () => index } }, event: { section, method, data } };
}
function codec(value) { return { toString: () => String(value), toHex: () => value }; }
function successEvents(sender, payloadHex) {
  return [
    eventRecord('system', 'Remarked', [codec(sender), codec(blake2AsHex(payloadHex))]),
    eventRecord('transactionPayment', 'TransactionFeePaid', [codec(sender), codec('12345'), codec('0')]),
    eventRecord('system', 'ExtrinsicSuccess', []),
  ];
}
test('finality requires dispatch success and the exact Remarked event in the same extrinsic', () => {
  const { prepared } = fixture();
  const records = successEvents(prepared.signerAddress, prepared.payloadHex);
  const result = inspectAnchorEvents(records, 2, prepared.signerAddress, prepared.payloadHex);
  assert.equal(result.status, 'finalized'); assert.equal(result.feePaidPlanck, '12345'); assert.equal(result.eventIndex, 0);
  assert.throws(() => inspectAnchorEvents(records, 1, prepared.signerAddress, prepared.payloadHex), /no ExtrinsicSuccess/);
  assert.throws(() => inspectAnchorEvents(records.slice(0, 2), 2, prepared.signerAddress, prepared.payloadHex), /no ExtrinsicSuccess/);
  const wrong = successEvents(prepared.signerAddress, `0x${'ff'.repeat(92)}`);
  assert.throws(() => inspectAnchorEvents(wrong, 2, prepared.signerAddress, prepared.payloadHex), /sender\/hash/);
});

test('a finalized failed dispatch is never reported as an anchored commitment', () => {
  const { prepared } = fixture();
  const records = [eventRecord('system', 'ExtrinsicFailed', [codec('BadOrigin')])];
  assert.deepEqual(inspectAnchorEvents(records, 2, prepared.signerAddress, prepared.payloadHex),
    { status: 'failed', dispatchError: 'BadOrigin', actualFeePlanck: null, feePaidPlanck: null });
});

test('failed dispatches retain actual fee evidence and reject unexpected payers or tips', () => {
  const { prepared } = fixture();
  const records = [eventRecord('system', 'ExtrinsicFailed', [codec('BadOrigin')]),
    eventRecord('transactionPayment', 'TransactionFeePaid', [codec(prepared.signerAddress), codec('10596636503'), codec('0')])];
  assert.deepEqual(inspectAnchorEvents(records, 2, prepared.signerAddress, prepared.payloadHex),
    { status: 'failed', dispatchError: 'BadOrigin', actualFeePlanck: '10596636503', feePaidPlanck: '10596636503' });
  records[1].event.data[2] = codec('1');
  assert.throws(() => inspectAnchorEvents(records, 2, prepared.signerAddress, prepared.payloadHex), /payer or tip/);
  records[1].event.data[2] = codec('0'); records[1].event.data[0] = codec(HUB_SIGNER_ADDRESS);
  assert.throws(() => inspectAnchorEvents(records, 2, prepared.signerAddress, prepared.payloadHex), /payer or tip/);
});

async function transportFixture(config = {}) {
  const { registry, metadata, pair } = fixture();
  const controls = { finalized: 100, nonce: '0', missingBlock: null, blocks: new Map(), events: [], persisted: false,
    feePlanck: '11386503', freePlanck: '200000000000', frozenPlanck: '0' };
  const requests = [];
  const feeInputs = [];
  const blockHash = (number) => `0x${number.toString(16).padStart(64, '0')}`;
  const asNumber = (value) => ({ toNumber: () => Number(value), toString: () => String(value) });
  const runtime = { specName: codec('statemint'), specVersion: asNumber(2005000), transactionVersion: asNumber(15) };
  const tx = (encoded) => registry.createType('Extrinsic', encoded);
  tx.system = { remarkWithEvent: (payloadHex) => registry.createType('Extrinsic', registry.createType('Call', { callIndex: [0, 7], args: [payloadHex] }), { version: 4 }) };
  const queryInfo = async (encoded) => { feeInputs.push(Buffer.from(encoded).toString('hex')); return { partialFee: codec(controls.feePlanck) }; };
  const at = { registry, runtimeVersion: runtime, consts: { balances: { existentialDeposit: codec('100000000') } },
    query: {
      system: { account: async () => ({ nonce: codec(controls.nonce), data: { free: codec(controls.freePlanck), frozen: codec(controls.frozenPlanck), reserved: codec('0') } }),
        events: async () => controls.events },
      timestamp: { now: async () => codec('1789256800000') },
    }, call: { transactionPaymentApi: { queryInfo } },
  };
  class ProviderClass {
    async connect() {}
    async send(method, args) {
      requests.push({ method, args });
      if (method === 'state_call' && args[0] === 'Metadata_metadata_at_version') {
        return `0x01${Buffer.from(registry.createType('Bytes', metadata.toHex()).toU8a()).toString('hex')}`;
      }
      if (method === 'chain_getBlock') {
        const number = Number(BigInt(args[0]));
        if (controls.missingBlock === number) throw new Error('Archive block unavailable');
        return { block: { extrinsics: controls.blocks.get(number) ?? [] } };
      }
      if (method === 'state_call' && args[0] === 'TaggedTransactionQueue_validate_transaction') {
        assert.ok(controls.persisted, 'actual signed bytes must not reach even a read-only RPC before durable storage');
        return registry.createType('TransactionValidity', { Ok: { priority: 0, requires: [], provides: [], longevity: 64, propagate: true } }).toHex();
      }
      if (method === 'author_submitExtrinsic') {
        assert.ok(controls.persisted, 'broadcast requires the durable outbox');
        controls.blocks.set(101, [args[0]]); controls.finalized = 101; controls.nonce = '1';
        controls.events = successEvents(pair.address, commitment()).map((record) => ({ ...record, phase: { isApplyExtrinsic: true, asApplyExtrinsic: asNumber(0) } }));
        return blake2AsHex(args[0]);
      }
      throw new Error(`Unexpected transport request ${method}`);
    }
  }
  class ApiClass {
    constructor() {
      this.isReadyOrError = Promise.resolve(this); this.genesisHash = codec(HUB_GENESIS_HASH);
      this.registry = registry; this.runtimeVersion = runtime; this.tx = tx;
      this.at = async () => at;
      this.rpc = {
        chain: {
          getFinalizedHead: async () => codec(blockHash(controls.finalized)),
          getBlockHash: async (number) => codec(blockHash(number)),
          getHeader: async (value) => {
            const number = Number(BigInt(typeof value === 'string' ? value : value.toHex()));
            return { number: asNumber(number), parentHash: codec(blockHash(number - 1)) };
          },
        },
        system: { properties: async () => ({ tokenDecimals: [10], tokenSymbol: ['DOT'] }), accountNextIndex: async () => codec(controls.nonce) },
      };
    }
    async disconnect() {}
  }
  const chain = await createChainClient({ signerAddress: pair.address, ...config }, { ApiClass, ProviderClass });
  const prepare = (options = {}) => chain.prepare({ payloadHex: commitment(), seedHex: `0x${'01'.repeat(32)}`, ...options });
  return { chain, controls, requests, feeInputs, prepare, blockHash };
}

test('preparation keeps real signed bytes local; post-outbox submission verifies finalized dispatch', async () => {
  const { chain, controls, requests, feeInputs, prepare } = await transportFixture();
  const prepared = await prepare();
  assert.equal(feeInputs.length, 1);
  assert.notEqual(feeInputs[0], prepared.signedHex.slice(2), 'fee quote must carry only a dummy signature');
  assert.ok(requests.every(({ method, args }) => method === 'state_call' && args[0] === 'Metadata_metadata_at_version'));
  assert.equal(await chain.recover(prepared).then((result) => result.status), 'pending');
  assert.equal(requests.filter(({ method }) => method === 'author_submitExtrinsic').length, 0);
  controls.persisted = true;
  const finalized = await chain.submitAndFinalize(prepared, { pollMs: 0, timeoutMs: 1000 });
  assert.equal(finalized.status, 'finalized');
  assert.equal(finalized.extrinsicHash, prepared.extrinsicHash);
  assert.equal(finalized.feePaidPlanck, '12345');
  assert.equal(requests.filter(({ method }) => method === 'author_submitExtrinsic').length, 1);
  assert.equal((await chain.recover(prepared)).status, 'finalized');
  assert.equal(requests.filter(({ method }) => method === 'author_submitExtrinsic').length, 1, 'recovery never rebroadcasts');
});

test('fee preflight needs no signer material and transmits only a dummy signature', async () => {
  const { chain, requests, feeInputs } = await transportFixture();
  const quote = await chain.estimateFee({ payloadHex: commitment() });
  assert.deepEqual(quote, { estimatedFeePlanck: '11386503' });
  assert.equal(feeInputs.length, 1);
  assert.ok(requests.every(({ method, args }) => method === 'state_call' && args[0] === 'Metadata_metadata_at_version'));
});

test('preparation rejects an elevated fee without approval before any fee quote or signing', async () => {
  const { prepare, requests, feeInputs } = await transportFixture();
  await assert.rejects(prepare({ maxFeePlanck: '50000001' }), /payload authorization policy/);
  assert.equal(feeInputs.length, 0);
  assert.equal(requests.length, 0);
});

test('approved preparation checks exact payload, live fee and spendable reserve before signer material', async () => {
  const approval = approvalFixture();
  const { prepare, controls, feeInputs, requests } = await transportFixture({
    signerAddress: HUB_SIGNER_ADDRESS, oneTimeApproval: approval,
  });
  const options = { payloadHex: approval.envelopeHex, maxFeePlanck: '12800000000', seedHex: undefined };
  await assert.rejects(prepare({ ...options, payloadHex: commitment() }), /payload authorization policy/);
  await assert.rejects(prepare({ ...options, maxFeePlanck: '12800000001' }), /payload authorization policy/);
  assert.equal(feeInputs.length, 0);
  controls.feePlanck = '12800000001';
  await assert.rejects(prepare(options), /Estimated DOT fee exceeds/);
  controls.feePlanck = '12800000000';
  controls.freePlanck = '23000000000'; controls.frozenPlanck = '1000000000';
  await assert.rejects(prepare(options), /Insufficient spendable DOT/);
  controls.frozenPlanck = '0';
  await assert.rejects(prepare(options), /Signer material is missing/);
  assert.ok(requests.every(({ method, args }) => method === 'state_call' && args[0] === 'Metadata_metadata_at_version'));
});

test('broadcast rechecks the current fee and never submits a now unaffordable saved transaction', async () => {
  const { chain, prepare, controls, requests } = await transportFixture();
  const prepared = await prepare();
  controls.persisted = true; controls.feePlanck = '50000001';
  await assert.rejects(chain.submitAndFinalize(prepared), /Current fee exceeds configured maximum/);
  assert.equal(requests.filter(({ method }) => method === 'author_submitExtrinsic').length, 0);
});

test('expiry recovery scans the complete mortal era and cannot infer absence from an RPC outage', async () => {
  const { chain, controls, requests, prepare } = await transportFixture();
  const prepared = await prepare();
  controls.finalized = prepared.eraDeath;
  controls.missingBlock = 125;
  await assert.rejects(chain.recover(prepared), /Archive block unavailable/);
  controls.missingBlock = null; requests.length = 0;
  const result = await chain.recover(prepared);
  assert.equal(result.status, 'expired');
  const scanned = requests.filter(({ method }) => method === 'chain_getBlock').map(({ args }) => Number(BigInt(args[0]))).sort((a, b) => a - b);
  assert.deepEqual(scanned, Array.from({ length: 63 }, (_, index) => 101 + index));
  assert.equal(requests.filter(({ method }) => method === 'author_submitExtrinsic').length, 0);
});

test('recovery detects a used nonce without treating a different transaction as this anchor', async () => {
  const { chain, controls, prepare } = await transportFixture();
  const prepared = await prepare(); controls.finalized = 105; controls.nonce = '1';
  controls.blocks.set(102, ['0x0400']);
  assert.equal((await chain.recover(prepared)).status, 'conflict');
});
