import { spawn } from "node:child_process";
import { resolve } from "node:path";

// The verifier uses only the Python standard library and the checked-in pipeline.
// It reads a bounded JSON payload over stdin, never executes book text or fetches URLs.
export async function verifyCorpusSource(plan) {
  if (!plan.verificationBundle) return;
  const sourcePath = process.env.PIPELINE_SOURCE_PATH ??
    resolve(import.meta.dirname, "../../../pipeline/src");
  await new Promise((resolvePromise, reject) => {
    const child = spawn("python3", ["-m", "good_doomscroller_pipeline", "verify", "-"], {
      env: { ...process.env, PYTHONPATH: sourcePath },
      stdio: ["pipe", "ignore", "pipe"],
      timeout: 120_000,
    });
    let detail = "";
    child.stderr.on("data", (chunk) => { detail = (detail + chunk).slice(-4_000); });
    child.on("error", reject);
    child.stdin.on("error", () => {});
    child.on("close", (code) => code === 0 ? resolvePromise() : reject(
      new Error(`Source reproduction failed for ${plan.book.title}: ${detail.trim()}`),
    ));
    child.stdin.end(JSON.stringify(plan));
  });
}
