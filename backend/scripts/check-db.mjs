/**
 * Read-only database check. Reports connectivity, the server version and which
 * of the tables this phase's Prisma schema maps are actually present.
 *
 * Runs no DDL and writes nothing. The connection string is never printed.
 *
 *   node --env-file=.env scripts/check-db.mjs
 */
import { PrismaClient } from '@prisma/client';

/** Tables the Phase 18.1 foundation maps. The rest belong to later phases. */
const FOUNDATION_TABLES = [
  'users',
  'roles',
  'permissions',
  'role_permissions',
  'user_roles',
  'branches',
];

function fail(message) {
  console.error(`XATO: ${message}`);
  process.exitCode = 1;
}

if (!process.env.DATABASE_URL) {
  fail('DATABASE_URL o‘rnatilmagan.');
  process.exit(1);
}
if (process.env.DATABASE_URL.includes('__PAROL__')) {
  fail('DATABASE_URL da hali placeholder parol turibdi (__PAROL__).');
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const [{ version, database, schema }] = await prisma.$queryRaw`
    SELECT version() AS version,
           current_database() AS database,
           current_schema() AS schema
  `;
  console.log('ULANISH        : CONNECTED');
  console.log(`SERVER         : ${version.split(',')[0]}`);
  console.log(`DATABASE       : ${database}`);
  console.log(`CURRENT SCHEMA : ${schema}`);

  const tables = await prisma.$queryRaw`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'fincore' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  const present = new Set(tables.map((row) => row.table_name));

  console.log(`\nfincore SXEMASIDAGI JADVALLAR: ${present.size} ta`);
  if (present.size === 0) console.log('  (sxema bo‘sh yoki mavjud emas)');

  console.log('\nPHASE 18.1 MODELLARI:');
  const missing = [];
  for (const table of FOUNDATION_TABLES) {
    const ok = present.has(table);
    if (!ok) missing.push(table);
    console.log(`  ${ok ? '[bor]     ' : '[YO‘Q]    '} fincore.${table}`);
  }

  const extra = [...present].filter((t) => !FOUNDATION_TABLES.includes(t));
  if (extra.length > 0) console.log(`\nBOSHQA JADVALLAR (keyingi bosqichlar): ${extra.length} ta`);

  if (missing.length > 0) {
    console.log(`\nMIGRATSIYA KERAK: ha — ${missing.length} ta jadval yetishmayapti.`);
    console.log('  docs/database/001_reference_schema.sql va 002_seed_reference.sql ishga tushirilsin.');
  } else {
    console.log('\nMIGRATSIYA KERAK: yo‘q — foundation jadvallari joyida.');
    const counts = await prisma.$queryRaw`
      SELECT (SELECT count(*) FROM fincore.users)       AS users,
             (SELECT count(*) FROM fincore.roles)       AS roles,
             (SELECT count(*) FROM fincore.permissions) AS permissions,
             (SELECT count(*) FROM fincore.branches)    AS branches
    `;
    const row = counts[0];
    console.log(
      `\nSEED HOLATI    : users=${row.users} roles=${row.roles} permissions=${row.permissions} branches=${row.branches}`,
    );
  }
} catch (error) {
  const message = String(error?.message ?? error)
    .split('\n')[0]
    .replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[redacted]');
  console.log('ULANISH        : CONNECTION FAILED');
  fail(message);
} finally {
  await prisma.$disconnect();
}
