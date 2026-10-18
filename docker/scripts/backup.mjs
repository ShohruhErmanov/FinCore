#!/usr/bin/env node
/**
 * Backs up the FinCore database from the running `db` container.
 *
 *   node docker/scripts/backup.mjs            -> docker/backups/fincore-<timestamp>.dump
 *
 * The dump is written inside the container and copied out with `docker compose
 * cp`, so no shell ever pipes binary data (PowerShell 5's `>` would re-encode
 * it and corrupt the file). Restore with docker/scripts/restore.mjs.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const run = (args) => {
  const result = spawnSync('docker', ['compose', ...args], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`docker compose ${args[0]} failed`);
};

const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const inside = `/tmp/fincore-${stamp}.dump`;
const outDir = resolve(root, 'docker/backups');
const outFile = resolve(outDir, `fincore-${stamp}.dump`);
mkdirSync(outDir, { recursive: true });

run([
  'exec',
  '-T',
  'db',
  'sh',
  '-c',
  `pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --schema=fincore --extension=pgcrypto --file=${inside}`,
]);
run(['cp', `db:${inside}`, outFile]);
run(['exec', '-T', 'db', 'rm', '-f', inside]);
console.log(`Zaxira nusxa: ${outFile} (${Math.round(statSync(outFile).size / 1024)} KB)`);
