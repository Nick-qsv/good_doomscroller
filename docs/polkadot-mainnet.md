# Mainnet funding and first-year budget

**Status, September 13, 2026: live; first anchor finalized and independently verified; daily schedule enabled.** The first batch committed **236 receipts** to Polkadot Hub. The user approved the ongoing AWS cost increase and reported funding the wallet with 20 DOT. The verified balance before the first stamp was **19.6618167519 DOT**; the independently read balance after its fee was **19.6606781016 DOT** at **00:13:02 UTC**.

**Network: Polkadot Hub / Asset Hub mainnet. Asset: native DOT.**

```text
12wmbcz2PqfsLdJHhpn12bbkR1Az1ydkEsoJDxkSjCm8Ue59
```

The remaining balance is well above the earlier 2 DOT funding proposal and the current one-year planning allowance. **No additional funding is needed for that allowance.** A second real worker run exited successfully as `idle`, with no additional transaction and account nonce still `1`.

## First finalized anchor

- Batch: `a6c85d1e-a90a-4fcd-9122-437edeb39b65`, containing **236 receipts**.
- Finalized block: **20,580,568**, timestamp **2026-09-13 00:09:12 UTC**, extrinsic index **2**. [Inspect the transaction](https://assethub-polkadot.subscan.io/extrinsic/20580568-2).
- Transaction hash: `0xd373951d89cb0677bdde4e93d2c1118521d987f45749717c21c0975e9e13ca0b`.
- Actual fee paid: **0.0011386503 DOT**.
- The downloaded proof passed the independent online verifier through Dwellir with exit `0`; the separate Python source-proof verification also passed. [View a live anchored passage](https://goodoomscroller.com/passages/fe293a46-6ab7-50c1-99d2-566775985907/verification).
- AWS `GetSchedule` confirmed the daily **03:00 UTC** schedule is `ENABLED`, targeting task revision **2** and image tag `mainnet-20260913-2`.

## Funding and spending limits

At the measured fee, 400 stamps cost approximately **0.45546012 DOT**. The worker preserves at least **1 DOT** as an operating reserve, bringing that planning allowance to **1.45546012 DOT**. Each stamp commits a fixed-size batch root, so its transaction size does not grow with the number of receipts in the batch. New receipts are batched daily; an idle run with no new receipts submits no transaction.

The worker limits an estimated transaction fee to **0.005 DOT**, permits at most **three prepared attempts per day**, and enforces a conservative **2 DOT rolling 365-day fee allowance**. Unresolved attempts reserve their maximum permitted fee against that allowance. It flags a balance below **2 DOT** for attention. These controls can pause work when conditions exceed the limits; they do not guarantee future network prices or a full year of uninterrupted service.

Do not infer the chain solely from the address format. The destination must receive native DOT on Hub/Asset Hub. An Ethereum-format address or wrapped DOT on another chain is not interchangeable with the intended SS58 account.

## Live measurement

The Parity and Dwellir mainnet RPC endpoints were checked independently. The first finalized **92-byte** commitment paid **0.0011386503 DOT**, matching its estimate. Chain genesis:

`0x68d56f15f85d3136970ec16946040bc1752654e906147f7e43e9d539d7c3de2f`

The implementation uses `system.remarkWithEvent`, a 92-byte `GDSANCH1` envelope, 64-block transaction expiry, and zero tip. The adapter explicitly validates the runtime's supported signed-extension pipeline and verifies the prepared signature before broadcast. Runtime compatibility and tamper-rejection tests pass. The first-stamp amount below is an actual paid fee; the yearly totals extrapolate that fee and remain estimates because future prices can change.

| Item | DOT |
| --- | ---: |
| First finalized stamp, actual fee paid | 0.0011386503 |
| 365 daily stamps plus initial backfill | 0.4167460098 |
| 400 stamps including retry/manual allowance | 0.45546012 |
| Worker operating reserve | 1 |
| 400-stamp allowance plus operating reserve | 1.45546012 |
| Verified funded balance before first fee | 19.6618167519 |
| Verified remaining balance at 2026-09-13 00:13:02 UTC | **19.6606781016** |

The earlier `infra/polkadot/mainnet-fee-estimate-2026-09-12.json` and `infra/polkadot/starting-balance.json` are historical setup snapshots; they do not represent the finalized fee or remaining balance above. See [Polkadot's fee estimation guide](https://docs.polkadot.com/chain-interactions/send-transactions/calculate-transaction-fees/) and the [official SDK endpoint registry](https://github.com/polkadot-js/apps/blob/master/packages/apps-config/src/endpoints/productionRelayPolkadot.ts).

## Additional AWS budget

The encrypted signer storage and audit resources have a $31.20 first-year baseline before free tiers, plus variable logs/API/storage charges. The original $50 planning allowance now gains approximately **$15/year** for the isolated worker and its monitoring/build resources. Allow **about $65 for the first year**, separately from DOT and the existing website hosting bill. This is an estimate, not a spending cap. [Operations and price sources](polkadot-operations.md).

## Verified launch and operations

- Terraform deployed the original **22 signer/audit resources** and **26 additional worker resources**. The worker has a dedicated ECS task role; the public web role cannot read the signer.
- The initializer creates a random sr25519 seed in memory and writes it through AWS CLI stdin; the seed is never printed or placed in Terraform. It preserves existing secret versions and refuses to replace an existing funding destination.
- The recovery command uses the reviewed `asm-exec` dynamic-reference mechanism. Only the recovered public address and public metadata can be printed. Public test-vector recovery, address encoding, valid signatures, and altered-message rejection passed. Real key recovery and a local signature check passed at 2026-09-12 22:18:20 UTC. Re-running initialization preserved the existing signer.
- CloudTrail logging, successful S3 and CloudWatch delivery, the initial write audit event, KMS rotation, and the three alarm/filter pairs were verified. No alarm notification destination is configured yet.
- Daily batch creation, durable transaction recovery, finalized-chain verification, public inclusion proofs, and spending limits are implemented. **32 anchoring tests**, including real database tests, pass and are covered by the new CI job.
- The first live commitment and its public proof are independently verified, and the daily **03:00 UTC** schedule is enabled. The second real run confirmed that no new receipts means no extra transaction. Alarm state is available in CloudWatch; **no email/push notification recipient is configured**.
- The deployed image is `mainnet-20260913-2`. Its remaining scan finding and applicability assessment are recorded in [the worker runbook](polkadot-worker-operations.md#residual-image-scan-finding---september-13-2026).

Initial backfill anchors can prove the supplied records existed by the new anchor block; they cannot independently establish those records' older claimed dates.
