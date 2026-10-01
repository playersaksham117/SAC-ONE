#!/usr/bin/env node
/**
 * CLI: Export SQLite → JSON
 * Usage:
 *   node src/scripts/export-json.js --complete
 *   node src/scripts/export-json.js --datasets products,customers
 *   node src/scripts/export-json.js --complete --from 2026-01-01 --to 2026-12-31
 */

import { getDatabase, closeDatabase } from '../database/connection.js';
import { exportService } from '../services/export.js';

function parseArgs(argv) {
  const out = { complete: false, datasets: null, dateFrom: null, dateTo: null };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--complete') out.complete = true;
    else if (a === '--datasets') out.datasets = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--from') out.dateFrom = argv[++i];
    else if (a === '--to') out.dateTo = argv[++i];
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || (!args.complete && !args.datasets?.length)) {
    console.log(`SACONE SQLite → JSON export

Usage:
  npm run export:json -- --complete
  npm run export:json -- --datasets products,customers,suppliers
  npm run export:json -- --complete --from 2026-04-01 --to 2026-09-30
`);
    process.exit(args.help ? 0 : 1);
  }

  getDatabase();
  const actor = {
    user: { id: null, fullName: 'CLI Export' },
    permissions: ['*'],
  };

  const result = exportService.runExport({
    complete: args.complete,
    datasets: args.datasets,
    dateFrom: args.dateFrom,
    dateTo: args.dateTo,
  }, actor);

  console.log('Export completed:', result.exportNumber);
  console.log('Output:', result.outputDir);
  console.log('Files:', result.fileCount, '| Records:', result.recordCount);
  closeDatabase();
}

main().catch((err) => {
  console.error(err.message || err);
  try { closeDatabase(); } catch { /* ignore */ }
  process.exit(1);
});
