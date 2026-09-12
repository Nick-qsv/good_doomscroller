import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";

import { createDatabaseClient } from "./database-config.mjs";

const migrationPath = process.argv[2];
if (!migrationPath) throw new Error("Usage: node scripts/migrate.mjs <migration.sql>");

const sql = createDatabaseClient();

try {
  // The legacy entry point supplies 0001; apply all ordered migrations beside it.
  const directory = migrationPath.endsWith(".sql") ? dirname(migrationPath) : migrationPath;
  for (const name of (await readdir(directory)).filter((value) => /^\d+.*\.sql$/.test(value)).sort()) {
    const path = join(directory, name);
    await sql.unsafe(await readFile(path, "utf8"));
    process.stdout.write(`Applied ${path}\n`);
  }
} finally {
  await sql.end();
}
