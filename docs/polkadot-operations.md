# Polkadot signer custody and AWS operations

**Status, September 13, 2026: live; first anchor finalized and independently verified; daily schedule enabled.** The first batch committed 236 receipts. The user explicitly approved the ongoing cost increase and proceeding on mainnet. Terraform deployed the original 22 custody/audit resources and 26 additional worker resources. CloudTrail is logging with successful S3 and CloudWatch delivery, KMS encryption-key rotation is enabled, and the custody filters and alarms exist. The stored wallet key was recovered through `asm-exec`, its public address matched, and its local signing check passed. Re-running initialization preserved the existing wallet.

The dedicated signer lives in AWS account `119033256269`, profile `w0m`, region `us-east-2`. Terraform manages custody/audit resources in `infra/terraform/polkadot.tf` and the isolated worker in `infra/terraform/polkadot-worker.tf`. Wallet generation and all secret values stay outside Terraform state. Funding address: `12wmbcz2PqfsLdJHhpn12bbkR1Az1ydkEsoJDxkSjCm8Ue59`, native DOT on Polkadot Hub / Asset Hub mainnet. Public metadata is in `infra/polkadot/funding.json`; this file contains no private key. The independently verified remaining balance was **19.6606781016 DOT** at **2026-09-13 00:13:02 UTC**, following a pre-fee balance of **19.6618167519 DOT**. The original `starting-balance.json` remains a historical pre-funding snapshot.

## Access and lifecycle

- Secret: `good-doomscroller-pilot/polkadot-anchor-signer`.
- KMS alias: `alias/good-doomscroller-pilot-polkadot-signer`.
- Access is restricted to the verified setup operator, `arn:aws:iam::119033256269:root`, and the dedicated anchoring worker task role. The public web role remains excluded from the signer secret and its KMS decrypt access.
- Terraform attaches the signer read policy to the worker and explicitly includes that role in the secret resource policy and KMS key policy. The separate ECS execution role handles image pulls and logs; it cannot read the signer or database secrets. The worker receives runtime references resolved through `asm-exec`, rather than plaintext key material in a task definition or Terraform state.
- KMS automatically rotates its encryption material annually while preserving old decrypt capability. **The wallet seed does not automatically rotate.** Replacing it changes the on-chain account and requires a deliberate wallet migration, balance transfer, and update to public signer records.
- Both secret and KMS key have Terraform `prevent_destroy` guards and 30-day deletion recovery windows. These safeguards do not prevent every privileged AWS Console/API action; monitor lifecycle operations and preserve recovery access.

Read secret material only through `asm-exec` with `{{resolve:secretsmanager:good-doomscroller-pilot/polkadot-anchor-signer:SecretString:seedHex}}`, using the repository's controlled runtime verification/signing command. Never print the resolved value, put it in command history, request it with `get-secret-value`/`batch-get-secret-value`, or inspect the Secrets Manager Agent daemon directly. Verify account identity before any AWS mutation. Print only public address, public key, chain identity, and successful verification status.

## Worker operation and verified launch

The anchoring worker is a separate scheduled ECS Fargate task with its own task role, execution role, container image and security group. It has no inbound service or load balancer. It reads the existing history database and writes batch manifests, receipt memberships and transaction attempts. The public web app reads finalized proof data and never signs transactions.

AWS `GetSchedule` confirmed the schedule is **enabled once daily at 03:00 UTC**, targeting task revision **2** with image tag `mainnet-20260913-2`. The first batch, `a6c85d1e-a90a-4fcd-9122-437edeb39b65`, committed **236 receipts** in finalized block **20,580,568** at **2026-09-13 00:09:12 UTC**. Its transaction hash is `0xd373951d89cb0677bdde4e93d2c1118521d987f45749717c21c0975e9e13ca0b`, extrinsic index **2**. [Inspect the transaction](https://assethub-polkadot.subscan.io/extrinsic/20580568-2).

The downloaded proof passed the independent Dwellir-based online verifier with exit `0`, and the separate Python source-proof verification passed. [The public passage page displays its anchored history](https://goodoomscroller.com/passages/fe293a46-6ab7-50c1-99d2-566775985907/verification). A second actual worker run exited `0` with status `idle`, sent no additional transaction and left the account nonce at `1`. The anchoring suite has **32 passing tests**, including real database tests, with a dedicated CI job.

Before broadcast, a database transaction durably records the exact signed bytes and recovery inputs. A timeout is ambiguous: the next run must recover the same transaction hash before preparing another attempt. On-chain failures require review; automatic retries do not silently replace a failed commitment. See [the worker runbook](polkadot-worker-operations.md) for release procedures and the residual image scan finding.

The exact commitment is a **92-byte `GDSANCH1` envelope** carrying the batch UUID, receipt count, Merkle root and previous root. The first finalized transaction paid **0.0011386503 DOT**, matching its estimate. Planning for 400 stamps at that fee gives **0.45546012 DOT** in fees, plus the worker's **1 DOT operating reserve**. The remaining balance of **19.6606781016 DOT** exceeds this allowance. Configured controls permit at most **0.005 DOT estimated fee per attempt**, **three prepared attempts daily**, and a conservative **2 DOT rolling 365-day fee allowance**. Unresolved attempts consume their maximum permitted fee against that allowance. The worker flags balances below **2 DOT** for attention. Future fees can change; exceeding a limit pauses work rather than increasing the allowance automatically.

The website checks receipt hashes and inclusion proofs against stored finalized evidence. Independent verification additionally reads the named chain to confirm the exact remark, signer, successful dispatch, event and canonical finalized block. See [the source and blockchain verification commands](verification.md). An initial backfill proves existence by its anchor block, not the truth of earlier dates inside receipts.

## Audit and monitoring

On 2026-09-12, read-only AWS discovery found no existing CloudTrail trail in `us-east-2`, including shadow trails. The new single-region trail records read/write management events, including Secrets Manager and KMS, and includes global service events. It writes to a private, versioned, SSE-S3 encrypted audit bucket and the encrypted CloudWatch Logs group `/aws/cloudtrail/good-doomscroller-pilot-polkadot-audit`. S3 log expiry starts after 400 days; noncurrent versions also remain for 400 days. CloudWatch retention is 400 days. CloudTrail digest validation is enabled.

The three CloudWatch alarms detect failed signer reads, more than three signer reads in five minutes, and wallet-secret writes/deletion/rotation attempts. The latter also surfaces attempts to configure unintended automatic wallet rotation. An intentional initial secret write may trigger the wallet-change alarm. These filters match calls that identify the signer by its full secret name or ARN; use the full name/ARN in operational commands.

The deployed worker adds two metric/alarm pairs: an anchoring error or low balance, and no successful or idle run for approximately 26 hours. The missing-run alarm's actions are enabled with the daily schedule. Inspect ECS stopped-task reasons, worker logs and Scheduler when investigating missed runs. No alarm has an email/push recipient configured.

**No notification recipient is configured.** Alarm state is visible in CloudWatch, but email/push delivery must be connected to a user-approved destination before unattended anchoring relies on these alerts. CloudTrail is an audit record, not an independent immutable backup of wallet keys.

Before initializing the wallet, confirm the applied trail reports `IsLogging: true`, its S3/CloudWatch delivery has no errors, and the three metric filters and alarms exist. After initialization, verify the public address through the `asm-exec` runtime path and confirm the write/read metadata appears in CloudTrail. Secret values should not appear in audit logs. Do not declare automatic daily anchoring active solely because these storage resources exist.

## Recovery and migration

If a secret is scheduled for deletion accidentally, restore it within 30 days. If the KMS key is scheduled for deletion, cancel its deletion before the 30-day window ends and re-enable it when necessary. Recover the original seed and verify that it derives the published public address before resuming signing. Keep a user-controlled encrypted or offline recovery copy when establishing wallet custody; an address/public-key file by itself cannot recover a wallet. Do not overwrite a wallet's original recovery artifact during initialization retries.

For a planned signer change, generate a new dedicated wallet, verify recovery and its public address, publish the signer transition in the history, move only the intended funds, and retain the old verification records. Old anchors remain verifiable with the old public address. Never schedule automatic seed replacement as if this were a database password.

## Added AWS cost

Using published US East rates as checked on 2026-09-12, the first-year baseline before free tiers and variable usage is approximately:

| Resource | First year |
| --- | ---: |
| One customer-managed KMS key, $1/month | $12.00 |
| One Secrets Manager secret, $0.40/month | $4.80 |
| Three custom CloudWatch metrics, $0.30 each/month | $10.80 |
| Three standard CloudWatch alarms, $0.10 each/month | $3.60 |
| **Baseline** | **$31.20** |

The original **$50 first-year custody/audit allowance** included modest logs and API usage. Add approximately **$15/year** for the worker and its monitoring/build resources, bringing the combined planning estimate to **about $65/year**. The increment covers small scheduled Fargate runs, their temporary public IPv4 use, image/build storage and usage, and two additional metric/alarm pairs. Frequent rebuilds, extended task runtimes, or larger log volumes can change that estimate.

This AWS allowance is separate from DOT transaction fees and existing app hosting. It is not a cost cap: CloudWatch/S3 storage and log volume vary, and the trail records regional management events for the account. The first copy of management events delivered by CloudTrail has no CloudTrail delivery charge; S3 and CloudWatch charges remain. KMS's first annual encryption-key rotation adds another $1/month from that rotation onward, so later-year budgets increase. Recheck actual usage after launch.

Sources: [AWS KMS pricing](https://aws.amazon.com/kms/pricing/), [Secrets Manager pricing](https://aws.amazon.com/secrets-manager/pricing/), [CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/), [CloudTrail pricing](https://aws.amazon.com/cloudtrail/pricing/), and [Secrets Manager CloudTrail auditing](https://docs.aws.amazon.com/secretsmanager/latest/userguide/monitoring-cloudtrail.html).
