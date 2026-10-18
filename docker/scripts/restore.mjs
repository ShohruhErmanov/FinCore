#!/usr/bin/env node
/**
 * Restores a FinCore dump into the `db` container — only into an EMPTY
 * database. It refuses when the fincore schema already exists, so a typo can
 * never overwrite live financial data.
 *
 *   node docker/scripts/restore.mjs docker/backups/fincore-<timestamp>.dump
 *
 * For a clean target: stop the stack, remove the volume, start the database
 * with FINCORE_DB_INIT=empty, then restore (see docker/README.md).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const file = process.argv[2] && resolve(process.cwd(), process.argv[2]);
if (!file || !existsSync(file)) {
  console.error('Foydalanish: node docker/scripts/restore.mjs <dump fayl>');
  process.exit(1);
}
const compose = (args, options = {}) =>
  spawnSync('docker', ['compose', ...args], { cwd: root, encoding: 'utf8', ...options });

const probe = compose([
  'exec',
  '-T',
  'db',
  'sh',
  '-c',
  `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT count(*) FROM pg_namespace WHERE nspname = 'fincore'"`,
]);
if (probe.status !== 0) {
  console.error('Baza konteyneriga ulanib bo‘lmadi: docker compose up -d db');
  process.exit(1);
}
if (probe.stdout.trim() !== '0') {
  console.error(
    'fincore sxemasi allaqachon bor — tiklash faqat bo‘sh bazaga qilinadi. Hech narsa o‘zgarmadi.',
  );
  process.exit(1);
}

const inside = `/tmp/${basename(file)}`;
const step = (args) => {
  const result = compose(args, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`docker compose ${args.slice(0, 2).join(' ')} failed`);
};
step(['cp', file, `db:${inside}`]);
try {
  // One transaction: a failure leaves the database exactly as empty as before.
  step([
    'exec',
    '-T',
    'db',
    'sh',
    '-c',
    `pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --exit-on-error --single-transaction ${inside}`,
  ]);
} finally {
  compose(['exec', '-T', 'db', 'rm', '-f', inside]);
}
console.log('Tiklandi. Keyin: docker compose up -d');
