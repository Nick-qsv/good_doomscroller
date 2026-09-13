# Mainnet funding and first-year budget

**Status: funded; isolated worker infrastructure deployed; first-anchor verification and automatic activation pending.** The user approved the ongoing AWS cost increase and reported funding the wallet with 20 DOT. The verified mainnet balance at the latest setup check was **19.6618167519 DOT**. The funding address was verified from the securely stored key.

**Network: Polkadot Hub / Asset Hub mainnet. Asset: native DOT.**

```text
12wmbcz2PqfsLdJHhpn12bbkR1Az1ydkEsoJDxkSjCm8Ue59
```

The verified balance is well above the earlier 2 DOT funding proposal and the current one-year planning allowance. **No additional funding is needed to start.** Funding and deployed resources alone do not establish a finalized anchor or an active daily schedule.

## Funding and spending limits

At the measured fee, 400 stamps cost approximately **0.45546012 DOT**. The worker preserves at least **1 DOT** as an operating reserve, bringing that planning allowance to **1.45546012 DOT**. Each stamp commits a fixed-size batch root, so its transaction size does not grow with the number of receipts in the batch. New receipts are batched daily; an idle run with no new receipts submits no transaction.

The worker limits an estimated transaction fee to **0.005 DOT**, permits at most **three prepared attempts per day**, and enforces a conservative **2 DOT rolling 365-day fee allowance**. Unresolved attempts reserve their maximum permitted fee against that allowance. It flags a balance below **2 DOT** for attention. These controls can pause work when conditions exceed the limits; they do not guarantee future network prices or a full year of uninterrupted service.

Do not infer the chain solely from the address format. The destination must receive native DOT on Hub/Asset Hub. An Ethereum-format address or wrapped DOT on another chain is not interchangeable with the intended SS58 account.

## Live measurement

The Parity and Dwellir mainnet RPC endpoints were checked independently. The updated fee estimate for the implemented **92-byte** commitment is **0.0011386503 DOT**. Chain genesis:

`0x68d56f15f85d3136970ec16946040bc1752654e906147f7e43e9d539d7c3de2f`

The implementation uses `system.remarkWithEvent`, a 92-byte `GDSANCH1` envelope, 64-block transaction expiry, and zero tip. The adapter explicitly validates the runtime's supported signed-extension pipeline and verifies the prepared signature before broadcast. Runtime compatibility and tamper-rejection tests pass. The amount below is a runtime fee estimate, not a receipt for a finalized application transaction; the first live anchor still needs independent verification.

| Item | DOT |
| --- | ---: |
| One estimated stamp | 0.0011386503 |
| 365 daily stamps plus initial backfill | 0.4167460098 |
| 400 stamps including retry/manual allowance | 0.45546012 |
| Worker operating reserve | 1 |
| 400-stamp allowance plus operating reserve | 1.45546012 |
| Verified funded balance at setup check | **19.6618167519** |

The earlier `infra/polkadot/mainnet-fee-estimate-2026-09-12.json` and `infra/polkadot/starting-balance.json` are historical setup snapshots; they do not represent the updated 92-byte quote or funded balance above. See [Polkadot's fee estimation guide](https://docs.polkadot.com/chain-interactions/send-transactions/calculate-transaction-fees/) and the [official SDK endpoint registry](https://github.com/polkadot-js/apps/blob/master/packages/apps-config/src/endpoints/productionRelayPolkadot.ts).

## Additional AWS budget

The encrypted signer storage and audit resources have a $31.20 first-year baseline before free tiers, plus variable logs/API/storage charges. The original $50 planning allowance now gains approximately **$15/year** for the isolated worker and its monitoring/build resources. Allow **about $65 for the first year**, separately from DOT and the existing website hosting bill. This is an estimate, not a spending cap. [Operations and price sources](polkadot-operations.md).

## Verified setup and remaining activation work

- Terraform deployed the original **22 signer/audit resources** and **26 additional worker resources**. The worker has a dedicated ECS task role; the public web role cannot read the signer.
- The initializer creates a random sr25519 seed in memory and writes it through AWS CLI stdin; the seed is never printed or placed in Terraform. It preserves existing secret versions and refuses to replace an existing funding destination.
- The recovery command uses the reviewed `asm-exec` dynamic-reference mechanism. Only the recovered public address and public metadata can be printed. Public test-vector recovery, address encoding, valid signatures, and altered-message rejection passed. Real key recovery and a local signature check passed at 2026-09-12 22:18:20 UTC. Re-running initialization preserved the existing signer.
- CloudTrail logging, successful S3 and CloudWatch delivery, the initial write audit event, KMS rotation, and the three alarm/filter pairs were verified. No alarm notification destination is configured yet.
- Daily batch creation, durable transaction recovery, finalized-chain verification, public inclusion proofs, and spending limits are implemented and tested. Worker infrastructure is deployed, but this status does not yet claim a verified first live anchor or an active schedule.
- Remaining activation work is to complete and independently verify the first live commitment, confirm its public proof download, and enable the daily **03:00 UTC** schedule. Alarm state is available in CloudWatch; no external notification recipient is configured.

Initial backfill anchors can prove the supplied records existed by the new anchor block; they cannot independently establish those records' older claimed dates.
