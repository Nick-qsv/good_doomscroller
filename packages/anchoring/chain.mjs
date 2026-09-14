import { ApiPromise, WsProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { Metadata } from '@polkadot/types';
import { blake2AsHex, blake2AsU8a, cryptoWaitReady, decodeAddress, signatureVerify } from '@polkadot/util-crypto';
import { parseEnvelope } from './proofs.mjs';
import { anchorPolicy } from './one-time-approval.mjs';

export const HUB_GENESIS_HASH = '0x68d56f15f85d3136970ec16946040bc1752654e906147f7e43e9d539d7c3de2f';
export const HUB_SIGNER_ADDRESS = '12wmbcz2PqfsLdJHhpn12bbkR1Az1ydkEsoJDxkSjCm8Ue59';
export const HUB_RPC_ENDPOINTS = ['wss://polkadot-asset-hub-rpc.polkadot.io', 'wss://asset-hub-polkadot-rpc.n.dwellir.com'];
export const ANCHOR_MAGIC = 'GDSANCH2';

// Runtime v2.5.0 explicitly freezes this v0 pipeline. Metadata v16 also advertises
// a DIFFERENT v1 pipeline. api 16.5.6 otherwise flattens both pipelines together.
// Source: polkadot-fellows/runtimes v2.5.0 asset-hub-polkadot/src/lib.rs:1717,2904.
export const V0_EXTENSIONS = Object.freeze([
  'AuthorizeCall', 'CheckNonZeroSender', 'CheckSpecVersion', 'CheckTxVersion',
  'CheckGenesis', 'CheckMortality', 'CheckNonce', 'CheckWeight',
  'ChargeAssetTxPayment', 'PrevalidateAttests', 'CheckMetadataHash',
  'EthSetOrigin', 'StorageWeightReclaim',
]);
const NULL_EXTENSIONS = ['AuthorizeCall', 'EthSetOrigin', 'StorageWeightReclaim'];
const EXTRA_DEFINITIONS = Object.fromEntries(NULL_EXTENSIONS.map((name) => [name, { extrinsic: {}, payload: {} }]));
const SHAPES = {
  CheckSpecVersion: ['Null', 'u32'], CheckTxVersion: ['Null', 'u32'],
  CheckGenesis: ['Null', 'H256'], CheckMortality: ['Era', 'H256'],
  CheckNonce: ['Compact<u32>', 'Null'],
  ChargeAssetTxPayment: ['{"tip":"Compact<u128>","assetId":"Option<StagingXcmV5Location>"}', 'Null'],
  CheckMetadataHash: ['{"mode":"FrameMetadataHashExtensionMode"}', 'Option<[u8;32]>'],
};

function ensure(condition, message) { if (!condition) throw new Error(message); }
function hash(value) { ensure(typeof value === 'string' && /^0x[0-9a-f]{64}$/i.test(value), 'Invalid hash'); return value.toLowerCase(); }
function planck(value, name) { ensure(/^(0|[1-9]\d*)$/.test(String(value)), `Invalid ${name}`); return BigInt(value); }
function integer(value, name) { ensure(Number.isSafeInteger(value) && value >= 0, `Invalid ${name}`); return value; }
function sameAccount(left, right) { return Buffer.from(decodeAddress(left)).equals(Buffer.from(decodeAddress(right))); }
function timeout(promise, milliseconds, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })])
    .finally(() => clearTimeout(timer));
}
function sleep(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

export function validateAnchorPayload(payload) {
  const hex = payload instanceof Uint8Array ? `0x${Buffer.from(payload).toString('hex')}` : payload;
  parseEnvelope(hex);
  return hex;
}

function payloadPolicy(payloadHex, config) {
  const policy = anchorPolicy(payloadHex, config.oneTimeApproval);
  if (policy.oneTimeApprovalId) {
    ensure(hash(config.oneTimeApproval.genesisHash) === hash(config.genesisHash ?? HUB_GENESIS_HASH) &&
      sameAccount(config.oneTimeApproval.signerAddress, config.signerAddress ?? HUB_SIGNER_ADDRESS),
    'Anchor approval targets another chain or signer');
  }
  return policy;
}

export function encodeRuntimeValidation(signedHex, blockHash) {
  ensure(typeof signedHex === 'string' && /^0x(?:[0-9a-f]{2})+$/i.test(signedHex), 'Invalid signed transaction');
  // TransactionSource::External (02), already SCALE-encoded extrinsic including
  // its compact length, and the 32-byte state hash. Do not wrap tx in Bytes again.
  return `0x02${signedHex.slice(2)}${hash(blockHash).slice(2)}`;
}

export function configureV0Registry(registry, metadata) {
  const extrinsic = metadata.asLatest.extrinsic;
  ensure([...extrinsic.versions].some((version) => Number(version) === 4), 'Runtime no longer supports reviewed signed extrinsic v4');
  const all = [...extrinsic.transactionExtensions];
  const versions = JSON.parse(JSON.stringify(extrinsic.transactionExtensionsByVersion));
  ensure(Array.isArray(versions['0']), 'Runtime metadata does not identify extension pipeline v0');
  const extensions = versions['0'].map((index) => all[Number(index)]);
  ensure(JSON.stringify(extensions.map((extension) => extension.identifier.toString())) === JSON.stringify(V0_EXTENSIONS), 'Runtime extension pipeline v0 changed; review before signing');
  for (const extension of extensions) {
    const name = extension.identifier.toString();
    const expected = SHAPES[name] ?? ['Null', 'Null'];
    const actual = [registry.lookup.getTypeDef(extension.type).type, registry.lookup.getTypeDef(extension.implicit).type];
    ensure(JSON.stringify(actual) === JSON.stringify(expected), `Runtime extension shape changed: ${name}`);
  }
  registry.setSignedExtensions([...V0_EXTENSIONS], EXTRA_DEFINITIONS);
}

export function validatePreparedRecord(prepared, config = {}) {
  ensure(prepared?.kind === 'good-doomscroller-polkadot-anchor' && prepared.schemaVersion === 1, 'Invalid prepared anchor schema');
  ensure(hash(prepared.genesisHash) === hash(config.genesisHash ?? HUB_GENESIS_HASH), 'Prepared anchor targets another chain');
  ensure(sameAccount(prepared.signerAddress, config.signerAddress ?? HUB_SIGNER_ADDRESS), 'Prepared anchor has another signer');
  validateAnchorPayload(prepared.payloadHex);
  const policy = payloadPolicy(prepared.payloadHex, config);
  if (policy.oneTimeApprovalId) {
    ensure(prepared.oneTimeApprovalId === policy.oneTimeApprovalId &&
      prepared.oneTimeApprovalSha256 === policy.oneTimeApprovalSha256, 'Prepared anchor approval does not match trusted authorization');
  } else {
    ensure(!Object.hasOwn(prepared, 'oneTimeApprovalId') && !Object.hasOwn(prepared, 'oneTimeApprovalSha256'),
      'Prepared anchor approval has no trusted authorization');
  }
  hash(prepared.extrinsicHash); hash(prepared.checkpointHash);
  ensure(/^0x(?:[0-9a-f]{2})+$/i.test(prepared.signedHex) &&
    prepared.signedHex.length <= 2 + (policy.maxPayloadBytes + 1024) * 2, 'Invalid signed anchor encoding');
  ensure(blake2AsHex(prepared.signedHex) === prepared.extrinsicHash, 'Signed anchor hash mismatch');
  planck(prepared.nonce, 'nonce');
  const maximumFee = planck(prepared.maxFeePlanck, 'maximum fee');
  const estimatedFee = planck(prepared.estimatedFeePlanck, 'fee');
  ensure(maximumFee > 0n && maximumFee <= policy.maxFeePlanck, 'Prepared anchor fee limit exceeds policy');
  ensure(estimatedFee > 0n && estimatedFee <= maximumFee, 'Prepared anchor estimated fee exceeds limit');
  ensure(planck(prepared.minBalancePlanck, 'minimum balance') >= 10000000000n, 'Prepared anchor reserve is below one DOT');
  integer(prepared.checkpointNumber, 'checkpoint'); integer(prepared.eraBirth, 'era birth'); integer(prepared.eraDeath, 'era death');
  ensure(prepared.eraBirth === prepared.checkpointNumber && prepared.eraDeath === prepared.eraBirth + 64, 'Invalid 64-block mortal anchor era');
  integer(prepared.specVersion, 'spec version'); integer(prepared.transactionVersion, 'transaction version');
  return prepared;
}

export function inspectSignedAnchor(api, prepared) {
  const tx = api.tx(prepared.signedHex);
  ensure(tx.isSigned && tx.type === 4, 'Anchor must use signed extrinsic v4');
  ensure(tx.hash.toHex() === prepared.extrinsicHash && tx.toHex() === prepared.signedHex, 'Signed anchor does not round-trip exactly');
  ensure(tx.method.section === 'system' && tx.method.method === 'remarkWithEvent', 'Only system.remarkWithEvent is permitted');
  ensure(tx.method.args[0].toHex() === prepared.payloadHex, 'Signed anchor payload mismatch');
  ensure(sameAccount(tx.signer.toString(), prepared.signerAddress), 'Signed anchor sender mismatch');
  ensure(tx.nonce.toString() === String(prepared.nonce) && tx.tip.toString() === '0', 'Signed anchor nonce/tip mismatch');
  ensure(tx.era.isMortalEra && tx.era.asMortalEra.period.toNumber() === 64 &&
    tx.era.asMortalEra.birth(prepared.checkpointNumber) === prepared.eraBirth &&
    tx.era.asMortalEra.death(prepared.checkpointNumber) === prepared.eraDeath, 'Signed anchor mortality mismatch');
  ensure(tx.inner.signature.get('assetId').isNone, 'Anchor fees must use native DOT');
  ensure(tx.inner.signature.get('mode').toNumber() === 0, 'Unexpected metadata-hash signing mode');
  const signingPayload = tx.registry.createType('ExtrinsicPayload', {
    method: tx.method.toHex(), era: tx.era, nonce: tx.nonce, tip: 0, assetId: null, mode: 0, metadataHash: null,
    genesisHash: prepared.genesisHash, blockHash: prepared.checkpointHash,
    specVersion: prepared.specVersion, transactionVersion: prepared.transactionVersion,
  }, { version: 4 }).toU8a({ method: true });
  const signingBytes = signingPayload.length > 256 ? blake2AsU8a(signingPayload) : signingPayload;
  ensure(signatureVerify(signingBytes, tx.signature.toU8a(), decodeAddress(prepared.signerAddress)).isValid, 'Prepared anchor signature is invalid');
  return tx;
}

export function inspectAnchorEvents(events, extrinsicIndex, signerAddress, payloadHex) {
  const matching = events.filter(({ phase }) => phase.isApplyExtrinsic && phase.asApplyExtrinsic.toNumber() === extrinsicIndex).map(({ event }) => event);
  const fee = matching.find((event) => event.section === 'transactionPayment' && event.method === 'TransactionFeePaid');
  if (fee) ensure(sameAccount(fee.data[0].toString(), signerAddress) && fee.data[2].toString() === '0', 'Unexpected fee payer or tip');
  const fees = { actualFeePlanck: fee ? fee.data[1].toString() : null, feePaidPlanck: fee ? fee.data[1].toString() : null };
  const failed = matching.find((event) => event.section === 'system' && event.method === 'ExtrinsicFailed');
  if (failed) return { status: 'failed', dispatchError: failed.data[0].toString(), ...fees };
  ensure(matching.some((event) => event.section === 'system' && event.method === 'ExtrinsicSuccess'), 'Finalized extrinsic has no ExtrinsicSuccess event');
  const remarked = matching.find((event) => event.section === 'system' && event.method === 'Remarked');
  ensure(remarked && sameAccount(remarked.data[0].toString(), signerAddress) && remarked.data[1].toHex() === blake2AsHex(payloadHex), 'Finalized Remarked sender/hash does not match commitment');
  return { status: 'finalized', ...fees,
    eventIndex: events.findIndex(({ event }) => event === remarked), remarkHash: blake2AsHex(payloadHex) };
}

export async function createChainClient(config = {}, { ApiClass = ApiPromise, ProviderClass = WsProvider } = {}) {
  await cryptoWaitReady(); // Recovery can be the first operation in a fresh process.
  const genesisHash = hash(config.genesisHash ?? HUB_GENESIS_HASH);
  ensure(genesisHash === HUB_GENESIS_HASH, 'This adapter permits Polkadot Hub mainnet only');
  const signerAddress = config.signerAddress ?? HUB_SIGNER_ADDRESS;
  decodeAddress(signerAddress);
  const preparedPolicy = { genesisHash, signerAddress, oneTimeApproval: config.oneTimeApproval };
  const endpoints = config.rpcEndpoints ?? HUB_RPC_ENDPOINTS;
  ensure(Array.isArray(endpoints) && endpoints.length > 0 && endpoints.every((endpoint) => typeof endpoint === 'string' && endpoint.startsWith('wss://')), 'Secure WebSocket RPC endpoints are required');
  let api, provider, endpoint;
  for (const candidate of endpoints) {
    const candidateProvider = new ProviderClass(candidate, false, {}, 15000);
    const candidateApi = new ApiClass({ provider: candidateProvider, noInitWarn: true, throwOnConnect: true, signedExtensions: EXTRA_DEFINITIONS });
    try {
      await candidateProvider.connect();
      await timeout(candidateApi.isReadyOrError, 25000, 'Polkadot RPC connection timed out');
      ensure(candidateApi.genesisHash.toHex() === genesisHash, 'RPC genesis hash mismatch');
      api = candidateApi; provider = candidateProvider; endpoint = candidate; break;
    } catch {
      await candidateApi.disconnect().catch(() => {});
    }
  }
  ensure(api, 'No configured RPC connected to the expected Polkadot Hub chain');

  async function metadataAt(blockHash, registry = api.registry) {
    // Legacy state_getMetadata still returns v14 on Hub. Request v16 explicitly
    // so the extension-version mapping is actually available for validation.
    const encoded = await provider.send('state_call', ['Metadata_metadata_at_version', '0x10000000', blockHash]);
    const opaque = registry.createType('Option<OpaqueMetadata>', Buffer.from(encoded.slice(2), 'hex'));
    ensure(opaque.isSome, 'Runtime does not expose reviewed metadata v16');
    return new Metadata(registry, opaque.unwrap().toHex());
  }

  async function readState() {
    ensure(api.genesisHash.toHex() === genesisHash, 'RPC chain identity changed');
    const finalizedHash = await api.rpc.chain.getFinalizedHead();
    const [header, at, properties] = await Promise.all([api.rpc.chain.getHeader(finalizedHash), api.at(finalizedHash), api.rpc.system.properties()]);
    const [account, timestamp, nextNonce] = await Promise.all([at.query.system.account(signerAddress), at.query.timestamp.now(), api.rpc.system.accountNextIndex(signerAddress)]);
    const chain = JSON.parse(JSON.stringify(properties));
    ensure(Number(chain.tokenDecimals?.[0]) === 10 && String(chain.tokenSymbol?.[0]) === 'DOT', 'Unexpected native token properties');
    const runtime = at.runtimeVersion;
    ensure(['statemint', 'asset-hub-polkadot'].includes(runtime.specName.toString()), 'Unexpected runtime identity');
    return {
      endpoint, genesisHash, signerAddress, finalizedBlockHash: finalizedHash.toHex(), finalizedBlockNumber: header.number.toNumber(),
      finalizedAt: new Date(Number(timestamp.toString())).toISOString(),
      balancePlanck: account.data.free.toString(), freePlanck: account.data.free.toString(), frozenPlanck: account.data.frozen.toString(), reservedPlanck: account.data.reserved.toString(),
      nonce: account.nonce.toString(), nextNonce: nextNonce.toString(), existentialDepositPlanck: at.consts.balances.existentialDeposit.toString(),
      specName: runtime.specName.toString(), specVersion: runtime.specVersion.toNumber(), transactionVersion: runtime.transactionVersion.toNumber(),
    };
  }

  async function signingContext(state) {
    // Read the metadata for the finalized checkpoint, including after runtime upgrades.
    const metadata = await metadataAt(state.finalizedBlockHash);
    const at = await api.at(state.finalizedBlockHash);
    configureV0Registry(api.registry, metadata);
    ensure(api.runtimeVersion.specVersion.toNumber() === state.specVersion && api.runtimeVersion.transactionVersion.toNumber() === state.transactionVersion, 'Runtime changed during preparation; retry with fresh state');
    return at;
  }

  async function quoteAnchor(payloadHex) {
    const commitment = validateAnchorPayload(payloadHex);
    const state = await readState();
    ensure(state.nonce === state.nextNonce, 'Signer already has a pending nonce; recover before preparing another anchor');
    const at = await signingContext(state);
    const options = {
      nonce: state.nonce, tip: 0, era: { current: state.finalizedBlockNumber, period: 64 },
      genesisHash, blockHash: state.finalizedBlockHash,
      runtimeVersion: { specVersion: state.specVersion, transactionVersion: state.transactionVersion },
      mode: 0, metadataHash: null, assetId: null,
    };
    const tx = api.tx.system.remarkWithEvent(commitment);
    tx.signFake(signerAddress, options);
    const bytes = tx.toU8a();
    const quote = await at.call.transactionPaymentApi.queryInfo(bytes, bytes.length);
    const estimatedFee = BigInt(quote.partialFee.toString());
    ensure(estimatedFee > 0n, 'Invalid estimated DOT fee');
    return { commitment, state, options, tx, estimatedFee };
  }

  // No signer material or real signature is needed to select a fee-fitting batch.
  async function estimateFee({ payloadHex }) {
    return { estimatedFeePlanck: (await quoteAnchor(payloadHex)).estimatedFee.toString() };
  }

  async function prepare({ payload, payloadHex, seedHex, maxFeePlanck = '50000000', minBalancePlanck = '10000000000', eraPeriod = 64 } = {}) {
    ensure(eraPeriod === 64, 'Only 64-block mortal transactions are permitted');
    const validatedPayload = validateAnchorPayload(payload ?? payloadHex);
    const policy = payloadPolicy(validatedPayload, preparedPolicy);
    const maximumFee = planck(maxFeePlanck, 'maximum fee');
    const minimumBalance = planck(minBalancePlanck, 'minimum balance');
    ensure(maximumFee > 0n && maximumFee <= policy.maxFeePlanck, 'Maximum fee exceeds payload authorization policy');
    ensure(minimumBalance >= 10000000000n, 'Minimum balance must preserve at least one DOT');
    const { commitment, state, options, tx, estimatedFee } = await quoteAnchor(validatedPayload);
    ensure(estimatedFee > 0n && estimatedFee <= maximumFee, 'Estimated DOT fee exceeds configured maximum');
    const reserve = minimumBalance > BigInt(state.existentialDepositPlanck) ? minimumBalance : BigInt(state.existentialDepositPlanck);
    const available = BigInt(state.freePlanck) - BigInt(state.frozenPlanck);
    ensure(available - maximumFee >= reserve, 'Insufficient spendable DOT after fee reserve');
    ensure(typeof seedHex === 'string' && /^(?:0x)?[0-9a-f]{64}$/i.test(seedHex), 'Signer material is missing or invalid');
    await cryptoWaitReady();
    const seed = Buffer.from(seedHex.replace(/^0x/, ''), 'hex');
    let pair;
    try {
      pair = new Keyring({ type: 'sr25519', ss58Format: 0 }).addFromSeed(seed);
      ensure(sameAccount(pair.address, signerAddress), 'Recovered signer does not match the configured funding address');
      tx.sign(pair, options);
    } finally {
      seed.fill(0);
      pair?.lock();
    }
    const prepared = {
      kind: 'good-doomscroller-polkadot-anchor', schemaVersion: 1,
      genesisHash, signerAddress, payloadHex: commitment, signedHex: tx.toHex(), extrinsicHash: tx.hash.toHex(),
      nonce: state.nonce, checkpointHash: state.finalizedBlockHash, checkpointNumber: state.finalizedBlockNumber,
      eraBirth: state.finalizedBlockNumber, eraDeath: state.finalizedBlockNumber + 64,
      specVersion: state.specVersion, transactionVersion: state.transactionVersion,
      estimatedFeePlanck: estimatedFee.toString(), maxFeePlanck: maximumFee.toString(), minBalancePlanck: reserve.toString(),
      preparedAt: new Date().toISOString(),
      ...(policy.oneTimeApprovalId ? { oneTimeApprovalId: policy.oneTimeApprovalId,
        oneTimeApprovalSha256: policy.oneTimeApprovalSha256 } : {}),
    };
    inspectSignedAnchor(api, validatePreparedRecord(prepared, preparedPolicy));
    // No real signed bytes leave this process until the caller saves prepared.
    // Local signature verification above is safe even for an abandoned dry run.
    return prepared;
  }

  async function validatePrepared(prepared) {
    validatePreparedRecord(prepared, preparedPolicy);
    const state = await readState();
    await signingContext(state);
    inspectSignedAnchor(api, prepared);
    ensure(state.finalizedBlockNumber < prepared.eraDeath, 'Prepared anchor has expired');
    ensure(state.specVersion === prepared.specVersion && state.transactionVersion === prepared.transactionVersion, 'Prepared anchor runtime changed');
    ensure(state.nonce === String(prepared.nonce), 'Prepared anchor nonce has already been used');
    const at = await api.at(state.finalizedBlockHash);
    // The metadata-derived api16.5.6 wrapper encodes a hex-string extrinsic with
    // an extra Bytes length prefix. Canonical raw arguments are required here.
    const validationHex = await provider.send('state_call', [
      'TaggedTransactionQueue_validate_transaction', encodeRuntimeValidation(prepared.signedHex, state.finalizedBlockHash), state.finalizedBlockHash,
    ]);
    const validation = api.registry.createType('TransactionValidity', validationHex);
    ensure(validation.isOk, `Prepared anchor failed runtime validation: ${validation.isErr ? validation.asErr.toString() : 'unknown result'}`);
    const bytes = Buffer.from(prepared.signedHex.slice(2), 'hex');
    const info = await at.call.transactionPaymentApi.queryInfo(bytes, bytes.length);
    const estimated = BigInt(info.partialFee.toString());
    ensure(estimated > 0n && estimated <= planck(prepared.maxFeePlanck, 'maximum fee'), 'Current fee exceeds configured maximum');
    ensure(BigInt(state.freePlanck) - BigInt(state.frozenPlanck) - planck(prepared.maxFeePlanck, 'maximum fee') >= planck(prepared.minBalancePlanck, 'minimum balance'), 'Insufficient DOT reserve before broadcast');
    return { valid: true, estimatedFeePlanck: estimated.toString(), finalizedBlockNumber: state.finalizedBlockNumber };
  }

  async function rawBlock(blockHash) { return (await provider.send('chain_getBlock', [blockHash])).block; }

  async function verifyFinalizedCommitment({ blockHash, extrinsicHash, extrinsicIndex, payloadHex, signerAddress: expectedSender = signerAddress }) {
    hash(blockHash); hash(extrinsicHash); validateAnchorPayload(payloadHex);
    const finalHash = await api.rpc.chain.getFinalizedHead();
    const [header, finalizedHeader] = await Promise.all([api.rpc.chain.getHeader(blockHash), api.rpc.chain.getHeader(finalHash)]);
    const blockNumber = header.number.toNumber();
    ensure(blockNumber <= finalizedHeader.number.toNumber(), 'Anchor block has not finalized');
    ensure((await api.rpc.chain.getBlockHash(blockNumber)).toHex() === blockHash, 'Anchor block is not on the canonical finalized chain');
    const block = await rawBlock(blockHash);
    const index = extrinsicIndex ?? block.extrinsics.findIndex((encoded) => blake2AsHex(encoded) === extrinsicHash);
    integer(index, 'extrinsic index');
    ensure(blake2AsHex(block.extrinsics[index] ?? '0x') === extrinsicHash, 'Extrinsic is absent from the claimed finalized block');
    const parentAt = await api.at(header.parentHash);
    const metadata = await metadataAt(header.parentHash.toHex(), parentAt.registry);
    configureV0Registry(parentAt.registry, metadata);
    const tx = parentAt.registry.createType('Extrinsic', block.extrinsics[index]);
    ensure(tx.isSigned && tx.type === 4 && tx.method.section === 'system' && tx.method.method === 'remarkWithEvent', 'Finalized call is not a signed remarkWithEvent');
    ensure(sameAccount(tx.signer.toString(), expectedSender) && tx.method.args[0].toHex() === payloadHex, 'Finalized call does not match signer and commitment');
    const at = await api.at(blockHash);
    const events = inspectAnchorEvents(await at.query.system.events(), index, expectedSender, payloadHex);
    const blockTimestamp = new Date(Number((await at.query.timestamp.now()).toString())).toISOString();
    return { ...events, genesisHash, signerAddress: expectedSender, payloadHex, blockHash, blockNumber: String(blockNumber), extrinsicHash, extrinsicIndex: index,
      finalizedAt: blockTimestamp, blockTimestamp, finalizedHeadHash: finalHash.toHex(),
      explorerUrl: `https://assethub-polkadot.subscan.io/extrinsic/${blockNumber}-${index}` };
  }

  async function recover(prepared) {
    validatePreparedRecord(prepared, preparedPolicy);
    const checkpointAt = await api.at(prepared.checkpointHash);
    const checkpointMetadata = await metadataAt(prepared.checkpointHash, checkpointAt.registry);
    configureV0Registry(checkpointAt.registry, checkpointMetadata);
    inspectSignedAnchor({ tx: (encoded) => checkpointAt.registry.createType('Extrinsic', encoded) }, prepared);
    ensure((await api.rpc.chain.getBlockHash(prepared.checkpointNumber)).toHex() === prepared.checkpointHash, 'Prepared checkpoint is not canonical');
    const state = await readState();
    // Never infer absence from an RPC failure. Every possible finalized block in
    // the original mortal era must be readable before an expired retry is safe.
    const end = Math.min(state.finalizedBlockNumber, prepared.eraDeath - 1);
    for (let number = prepared.checkpointNumber + 1; number <= end; number += 8) {
      const results = await Promise.all(Array.from({ length: Math.min(8, end - number + 1) }, async (_, offset) => {
        const blockHash = (await api.rpc.chain.getBlockHash(number + offset)).toHex();
        const block = await rawBlock(blockHash);
        const index = block.extrinsics.findIndex((encoded) => blake2AsHex(encoded) === prepared.extrinsicHash);
        return { blockHash, index };
      }));
      const found = results.find((result) => result.index >= 0);
      if (found) return verifyFinalizedCommitment({ blockHash: found.blockHash, extrinsicHash: prepared.extrinsicHash, extrinsicIndex: found.index, payloadHex: prepared.payloadHex });
    }
    if (BigInt(state.nonce) > BigInt(prepared.nonce)) return { status: 'conflict', nonce: state.nonce, reason: 'Signer nonce was used by a different transaction' };
    if (state.finalizedBlockNumber >= prepared.eraDeath) return { status: 'expired', scannedThrough: end, finalizedBlockNumber: state.finalizedBlockNumber };
    return { status: 'pending', finalizedBlockNumber: state.finalizedBlockNumber, eraDeath: prepared.eraDeath };
  }

  async function submitAndFinalize(prepared, { timeoutMs = 210000, pollMs = 6000 } = {}) {
    // The caller MUST durably save prepared BEFORE this function. A timeout or
    // rejected RPC response is ambiguous: recover this same hash before retrying.
    const existing = await recover(prepared);
    if (existing.status !== 'pending') return existing;
    await validatePrepared(prepared);
    const submitted = await provider.send('author_submitExtrinsic', [prepared.signedHex]);
    ensure(submitted === prepared.extrinsicHash, 'RPC returned an unexpected submitted hash');
    const deadline = Date.now() + timeoutMs;
    let nextBlock = prepared.checkpointNumber + 1;
    while (Date.now() < deadline) {
      const state = await readState();
      const end = Math.min(state.finalizedBlockNumber, prepared.eraDeath - 1);
      for (; nextBlock <= end; nextBlock += 1) {
        const blockHash = (await api.rpc.chain.getBlockHash(nextBlock)).toHex();
        const block = await rawBlock(blockHash);
        const index = block.extrinsics.findIndex((encoded) => blake2AsHex(encoded) === prepared.extrinsicHash);
        if (index >= 0) return verifyFinalizedCommitment({ blockHash, extrinsicHash: prepared.extrinsicHash, extrinsicIndex: index, payloadHex: prepared.payloadHex });
      }
      if (state.finalizedBlockNumber >= prepared.eraDeath || BigInt(state.nonce) > BigInt(prepared.nonce)) return recover(prepared);
      await sleep(pollMs);
    }
    return { status: 'pending', extrinsicHash: prepared.extrinsicHash, reason: 'Finalization wait timed out; recover this hash before creating another transaction' };
  }

  return { readState, estimateFee, prepare, validatePrepared, recover, submitAndFinalize, verifyFinalizedCommitment, disconnect: () => api.disconnect() };
}
