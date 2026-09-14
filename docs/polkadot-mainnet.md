# Mainnet funding and first-year budget

**Status, September 14, 2026: live; four anchors finalized and independently verified; daily revision-3 schedule enabled.** The science-expansion anchor committed **144 current public receipts**, including 60 new science passages, to Polkadot Hub. Batch `dde3620e-9d3b-44ae-8626-840f5eeff6ca` finalized in block **20,619,467**, extrinsic index **2**, and paid **0.4097286503 DOT** under the approved one-time **0.5 DOT** ceiling. [Inspect the transaction](https://assethub-polkadot.subscan.io/extrinsic/20619467-2). The exact readable-rationale payload, all database memberships, task result, public receipt histories, and independent public-chain evidence agree.

Task revision 4, image `science-rationales-20260913-v1`, was approved only for the completed bounded one-time run, and the one-time approval was consumed exactly once. A staged disabled-first rollback restored the normal 03:00 UTC schedule to the previously reviewed revision 3 and image `rationales-20260913-3`. Fresh AWS readback confirmed `ENABLED`, the exact matching revision-3 IAM allowlist, no running or pending task, and both worker alarms present and `OK`. The ordinary limits remain **0.005 DOT** per attempt, 2 DOT per rolling year, a 1 DOT reserve, and three attempts per day. Terraform desired values match; a full plan showed no anchoring resource action, but was not applied because it still contains the known unrelated web EC2 replacement. Evidence is recorded in `infra/releases/science-rationales-2026-09-13/rollback-to-rev3-final-verification.json`.

The first batch committed **236 receipts** to Polkadot Hub. The user approved the ongoing AWS cost increase and reported funding the wallet with 20 DOT. The verified balance before the first stamp was **19.6618167519 DOT**; the independently read balance after its fee was **19.6606781016 DOT** at **00:13:02 UTC**.

**Network: Polkadot Hub / Asset Hub mainnet. Asset: native DOT.**

```text
12wmbcz2PqfsLdJHhpn12bbkR1Az1ydkEsoJDxkSjCm8Ue59
```

After the fourth anchor, a finalized public-chain read measured **19.0881471507 DOT** at **2026-09-14 02:07:36 UTC**, with both the account nonce and next nonce at `4`. The balance remains well above the configured **2 DOT rolling fee allowance plus 1 DOT operating reserve**. **No additional funding is needed for that allowance.** An earlier second worker run exited successfully as `idle`, submitted no transaction, and left the nonce at `1` at that time.

## First finalized anchor

- Batch: `a6c85d1e-a90a-4fcd-9122-437edeb39b65`, containing **236 receipts**.
- Finalized block: **20,580,568**, timestamp **2026-09-13 00:09:12 UTC**, extrinsic index **2**. [Inspect the transaction](https://assethub-polkadot.subscan.io/extrinsic/20580568-2).
- Transaction hash: `0xd373951d89cb0677bdde4e93d2c1118521d987f45749717c21c0975e9e13ca0b`.
- Actual fee paid: **0.0011386503 DOT**.
- The downloaded proof passed the independent online verifier through Dwellir with exit `0`; the separate Python source-proof verification also passed. [View a live anchored passage](https://goodoomscroller.com/passages/fe293a46-6ab7-50c1-99d2-566775985907/verification).
- At first launch, AWS `GetSchedule` confirmed the daily **03:00 UTC** schedule was `ENABLED`, targeting task revision **2** and image tag `mainnet-20260913-2`.

## Funding and spending limits

At the first anchor's measured legacy fee, 400 legacy-sized stamps would cost approximately **0.45546012 DOT**. The worker preserves at least **1 DOT** as an operating reserve, bringing that planning allowance to **1.45546012 DOT**. The legacy `GDSANCH1` envelope is fixed at 92 bytes. The current `GDSANCH2` format carries readable rationale entries, so its payload and fee grow with the selected receipts. The revision-3 worker bounds the envelope at 128 KiB and selects the longest ordered prefix that fits both that limit and the ordinary fee ceiling, retaining the remainder for a later batch. An idle run with no new receipts submits no transaction.

The worker limits an estimated transaction fee to **0.005 DOT**, permits at most **three prepared attempts per day**, and enforces a conservative **2 DOT rolling 365-day fee allowance**. Unresolved attempts reserve their maximum permitted fee against that allowance. It flags a balance below **2 DOT** for attention. These controls can pause work when conditions exceed the limits; they do not guarantee future network prices or a full year of uninterrupted service.

Do not infer the chain solely from the address format. The destination must receive native DOT on Hub/Asset Hub. An Ethereum-format address or wrapped DOT on another chain is not interchangeable with the intended SS58 account.

## Live measurement

The Parity and Dwellir mainnet RPC endpoints were checked independently. The first finalized **92-byte** commitment paid **0.0011386503 DOT**, matching its estimate. Chain genesis:

`0x68d56f15f85d3136970ec16946040bc1752654e906147f7e43e9d539d7c3de2f`

The implementation uses `system.remarkWithEvent`, 64-block transaction expiry, and zero tip. The first anchor used the 92-byte legacy `GDSANCH1` envelope; current revision 3 also supports bounded `GDSANCH2` envelopes with readable per-receipt rationales. The adapter explicitly validates the runtime's supported signed-extension pipeline and verifies the prepared signature before broadcast. Runtime compatibility and tamper-rejection tests pass. The first-stamp amount below is an actual paid fee; the 400-stamp totals extrapolate that legacy fee and remain estimates because future payloads and prices can change.

| Item | DOT |
| --- | ---: |
| First finalized stamp, actual fee paid | 0.0011386503 |
| Fourth science-expansion anchor, actual fee paid | 0.4097286503 |
| 365 legacy-sized daily stamps plus initial backfill, projected | 0.4167460098 |
| 400 legacy-sized stamps including retry/manual allowance, projected | 0.45546012 |
| Worker operating reserve | 1 |
| Legacy 400-stamp allowance plus operating reserve | 1.45546012 |
| Verified funded balance before first fee | 19.6618167519 |
| Historical balance after first fee, 2026-09-13 00:13:02 UTC | 19.6606781016 |
| Current verified balance, 2026-09-14 02:07:36 UTC | **19.0881471507** |

The earlier `infra/polkadot/mainnet-fee-estimate-2026-09-12.json` and `infra/polkadot/starting-balance.json` are historical setup snapshots; they do not represent the finalized fee or remaining balance above. See [Polkadot's fee estimation guide](https://docs.polkadot.com/chain-interactions/send-transactions/calculate-transaction-fees/) and the [official SDK endpoint registry](https://github.com/polkadot-js/apps/blob/master/packages/apps-config/src/endpoints/productionRelayPolkadot.ts).

## Additional AWS budget

The encrypted signer storage and audit resources have a $31.20 first-year baseline before free tiers, plus variable logs/API/storage charges. The original $50 planning allowance now gains approximately **$15/year** for the isolated worker and its monitoring/build resources. Allow **about $65 for the first year**, separately from DOT and the existing website hosting bill. This is an estimate, not a spending cap. [Operations and price sources](polkadot-operations.md).

## Verified launch and operations

- Terraform deployed the original **22 signer/audit resources** and **26 additional worker resources**. The worker has a dedicated ECS task role; the public web role cannot read the signer.
- The initializer creates a random sr25519 seed in memory and writes it through AWS CLI stdin; the seed is never printed or placed in Terraform. It preserves existing secret versions and refuses to replace an existing funding destination.
- The recovery command uses the reviewed `asm-exec` dynamic-reference mechanism. Only the recovered public address and public metadata can be printed. Public test-vector recovery, address encoding, valid signatures, and altered-message rejection passed. Real key recovery and a local signature check passed at 2026-09-12 22:18:20 UTC. Re-running initialization preserved the existing signer.
- CloudTrail logging, successful S3 and CloudWatch delivery, the initial write audit event, KMS rotation, and the three alarm/filter pairs were verified. No alarm notification destination is configured yet.
- Daily batch creation, durable transaction recovery, finalized-chain verification, public inclusion proofs, and spending limits are implemented. The release build passed **59 anchoring tests** against PostgreSQL with no failures or skips; the dedicated CI job covers the suite.
- All four live commitments and their public proofs are independently verified, and the daily **03:00 UTC** schedule is enabled on revision 3. An earlier real idle run confirmed that no new receipts means no extra transaction. Both worker alarms are present and `OK`; **no email/push notification recipient is configured**.
- The scheduled image is `rationales-20260913-3`; the science one-time image remains revision 4 but is not scheduled. Their remaining scan finding and applicability assessment are recorded in [the worker runbook](polkadot-worker-operations.md#residual-image-scan-finding---september-13-2026).

Initial backfill anchors can prove the supplied records existed by the new anchor block; they cannot independently establish those records' older claimed dates.
