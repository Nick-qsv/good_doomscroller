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
  const [{ migrations_table: migrationsTable }] = await sql`
    SELECT to_regclass('public.schema_migrations')::text AS migrations_table
  `;
  const applied = new Set(migrationsTable
    ? (await sql`SELECT version FROM schema_migrations`).map((row) => row.version)
    : []);
  for (const name of (await readdir(directory)).filter((value) => /^\d+.*\.sql$/.test(value)).sort()) {
    // Reapplying 0001 would temporarily replace the rights-filtered public view
    // with its historic unrestricted definition on a running deployment.
    if (applied.has(name.slice(0, -4))) continue;
    const path = join(directory, name);
    await sql.unsafe(await readFile(path, "utf8"));
    process.stdout.write(`Applied ${path}\n`);
  }
} finally {
  await sql.end();
}
