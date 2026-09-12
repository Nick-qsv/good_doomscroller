# Public runtime fixture

`hub-v2005000-minimal.json` is a reduced copy of public Polkadot Hub metadata v16
queried from `wss://polkadot-asset-hub-rpc.polkadot.io` on 2026-09-12 at finalized
block 20,579,677, hash
`0x8238b1bb38ac8bc546878cd11105a326a9cbc333f7685a75a37fe021229a15ea`.

It keeps the real `system.remark_with_event` call, its reachable SCALE types,
extrinsic versions, and both transaction-extension pipelines. Other pallets,
storage, APIs, events, errors, and documentation were removed to keep the fixture
small. It is a codec test fixture, not full metadata suitable for operating a node
or deriving the chain's metadata hash. The signer used by tests is the public,
artificial 32-byte seed consisting entirely of `01` bytes and must never be funded.

Runtime source: https://github.com/polkadot-fellows/runtimes/blob/v2.5.0/system-parachains/asset-hubs/asset-hub-polkadot/src/lib.rs
