# Daily Polkadot anchoring worker

The worker infrastructure is defined in `infra/terraform/polkadot-worker.tf`. Deployment and successful mainnet finalization must be verified before marking this runbook active. Terraform initially leaves the schedule disabled.

The task runs at **03:00 UTC daily**. EventBridge Scheduler starts one Linux Fargate task with 0.25 vCPU and 1 GiB memory. It uses the existing public subnet and a temporary public IP for HTTPS access to Polkadot RPC and AWS. Its security group has no ingress; outbound access is limited to HTTPS and PostgreSQL in the existing database security group. It creates no NAT gateway, load balancer, always-running container, or replacement EC2 host.

The task role can read only the signer and RDS credentials. The execution role pulls only its ECR image and writes its dedicated log group. The build role reads the one source ZIP and pushes only its ECR repository; it cannot read either runtime secret or deploy tasks. The scheduler can run only the configured task revision on its cluster and pass only the two ECS roles. The web host receives no signer access.

The existing signer resource policy permits secret reads by the setup operator and dedicated task role; only the setup operator may alter the secret. KMS decryption is limited to the worker principal, Secrets Manager in `us-east-2`, account `119033256269`, and this secret's encryption context. AWS supplies the IAM role ARN in `aws:PrincipalArn` for task-role sessions. Database credentials are the existing RDS-managed secret; database grants are currently the pilot's existing master user, while IAM and network access remain isolated.

The image contains Node 22, Python 3, AWS CLI v2, the reviewed `asm-exec`, and the RDS CA trust bundle. Runtime environment values contain dynamic references, not secrets. `asm-exec` resolves them inside the task using its short-lived ECS task credentials. The database connection verifies its TLS certificate. The filesystem is read-only, Linux capabilities are dropped, the process runs as UID 1000, and a container-level 20-minute limit bounds runtime including secret resolution. No wallet material is packaged, stored in Terraform, or printed.

## Build and first run

1. Run local tests, then create the allowlisted source ZIP:

   ```sh
   python3 infra/runtime/anchoring-ops.py pack
   ```

   This includes only top-level anchoring source/tests/package files, the reviewed public runtime metadata fixture, the Dockerfile, `.dockerignore`, and `asm-exec`. Repackage after edits. It excludes `.git`, dependency folders, credentials, Terraform state, and unrelated application files.

2. Plan the worker resources with `polkadot_schedule_enabled=false`. Use the account-checking Terraform wrapper. `infra/polkadot/worker-terraform-targets.json` lists the new worker resources and the three existing signer controls that need updates. A targeted plan is appropriate for this rollout because the existing EC2 user-data has unrelated drift. Review every action and reject any EC2 replacement, RDS replacement, secret replacement, or unexpected destructive change. Targeting is not permission to ignore dependencies or plan output.

3. Apply the reviewed worker plan. Read `terraform output -json polkadot_worker` through the wrapper for the source S3 URI, CodeBuild project, ECR repository/tag, and task identifiers. Verify `w0m` resolves to account `119033256269` immediately before uploading the ZIP or starting the build. Upload the source ZIP to that exact URI and start the on-demand CodeBuild project. The build runs tests, audits production npm dependencies, builds for `linux/amd64`, tests the finished image, and pushes an immutable tag. Review build success and ECR scan findings before running.

4. Launch a preflight task:

   ```sh
   python3 infra/runtime/anchoring-ops.py run --dry-run
   ```

   The helper account-checks the operation and prints a request ID before dispatch. Reuse `--request-id` if the API result is uncertain. Inspect the returned task ARN:

   ```sh
   python3 infra/runtime/anchoring-ops.py status TASK_ARN
   ```

   The task must exit zero and emit a successful dry-run result in `/ecs/good-doomscroller-pilot-polkadot-anchor`. The current database must already have the anchoring migration. A preflight does not mark anything anchored or enable the schedule.

5. Launch one real task with `python3 infra/runtime/anchoring-ops.py run`. Confirm exit zero, a `complete` result, and the persisted block/hash/receipt inclusion proof. Independently verify the exact finalized mainnet commitment before enabling `polkadot_schedule_enabled=true` with a reviewed Terraform apply. An accepted `RunTask` response alone is not successful anchoring.

Use a new immutable image tag for each later release. Apply the task revision while keeping the schedule disabled if a release requires a migration or first-run check, then enable after verification. Preserve the old tags for rollback. The image lifecycle policy removes only untagged leftovers, so an old deployed tag is never deleted merely because newer builds exist.

## Limits, recovery, and monitoring

The worker allows only the project's fixed 92-byte `system.remarkWithEvent` commitment and checks mainnet genesis, the funding account, the transaction format, DOT fees, and the finalized success/remark events. The configured preflight fee ceiling is **0.005 DOT per transaction**, the rolling annual accounting limit is **2 DOT**, the minimum remaining reserve is **1 DOT**, and at most three new transaction attempts may be prepared per UTC day. These are worker safeguards; they do not establish an on-chain spending restriction on the wallet key. Keep this wallet dedicated to anchoring.

The database is the durable transaction outbox. Exact signed bytes are saved before any RPC receives the usable transaction. A retry scans the original mortal era and recovers or rebroadcasts the same transaction. It must not sign a replacement after an ambiguous response until finalized-chain evidence proves the old transaction expired without inclusion. Conflicting nonces, failed dispatch, changed runtime formats, and broken historical proofs stop progress for review. Never clear pending records or advance the nonce manually to get past a failed task.

Scheduler retries are limited to two attempts over one hour; they cover task launch delivery, not application success. Application failures are retried through the durable outbox on the next daily run or a reviewed manual run. Logs retain 400 days. Two extra CloudWatch metrics and alarms show an error/low-balance event or approximately 26 hours without a `complete`/`idle` result. Dry runs, busy tasks, and pending finalization do not count as successful daily runs. **No email/push recipient is configured.** Inspect the alarms and public history backlog, and configure a user-approved destination before relying on message delivery.

## Incremental annual AWS estimate

The additional worker is small because compute and its public IP exist for minutes per day. At an illustrative ten minutes daily, 0.25 vCPU and 1 GiB add about **$0.89/year** in Fargate compute at the published US East Linux/x86 example rates, plus approximately **$0.30/year** for IPv4. Two metrics and two standard alarms add up to **$9.60/year** before free tiers. Allow approximately **$15/year extra** for this worker, including small ECR storage, occasional builds, scheduler/API calls, and logs; this is an estimate, not a cap. Using a roughly **$65/year total anchoring AWS allowance** preserves the earlier $50 custody/audit allowance and adds the worker. It excludes existing site hosting and DOT fees. Recheck actual Ohio regional charges and image storage after launch.

Sources: [Fargate pricing](https://aws.amazon.com/fargate/pricing/), [public IPv4 pricing](https://aws.amazon.com/vpc/pricing/), [CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/), [ECS task role separation](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html), and [AWS MCP IAM behavior](https://docs.aws.amazon.com/agent-toolkit/latest/userguide/security_iam_service-with-iam.html).
