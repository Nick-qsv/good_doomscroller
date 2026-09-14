#!/usr/bin/env node

import process from "node:process";

import { createDatabaseClient } from "./database-config.mjs";
import {
  assertPublishableCorpusPlans,
  importCorpusPlans,
  parseImportArguments,
  readCorpusPlan,
} from "./import-corpus-lib.mjs";

const usage = `Usage: npm run corpus:import -- [--publish] [--replace-editions] <feed.json> [feed.json ...]

Imports verified pipeline feed JSON into PostgreSQL in one transaction.
Without --publish, passages remain candidates and are hidden from the public feed.
With --publish --replace-editions, passages omitted from each supplied edition are archived.
Publication requires the exact edition and source hashes in publication-policy.json.
Retired editions cannot be imported again, including as candidates.
Matching notes/<feed>.md or notes/<feed>-qc.md files are preserved as public editorial assertions.
`;

async function main() {
  const options = parseImportArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage);
    return;
  }

  // Parse and verify every file before opening a database transaction. A broken
  // file therefore cannot leave an otherwise-valid batch partially imported.
  const plans = await Promise.all(options.paths.map(readCorpusPlan));
  if (options.publish) assertPublishableCorpusPlans(plans);
  const sql = createDatabaseClient();
  try {
    const totals = await importCorpusPlans(sql, plans, options);
    const status = options.publish ? "published" : "candidate";
    process.stdout.write(
      `Imported ${totals.books} book(s), ${totals.editions} edition(s), ` +
        `${totals.chapters} chapter(s), and ${totals.passages} ${status} passage(s); ` +
        `archived ${totals.archived} omitted passage(s).\n`,
    );
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  process.stderr.write(`Corpus import failed: ${error.message}\n`);
  process.exitCode = 1;
});
