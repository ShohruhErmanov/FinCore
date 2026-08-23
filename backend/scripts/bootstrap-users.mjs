/**
 * Creates the three real staff accounts on a freshly initialised database.
 *
 * The roster (names, roles, branches) comes from docs/PROJECT_REQUIREMENTS.md
 * §"Rollar", which mirrors the office Excel's Rollar sheet. Phone numbers and
 * passwords are NOT in any repository file and must be supplied through the
 * environment — nothing here is invented or hardcoded.
 *
 *   BOOTSTRAP_DIRECTOR_PHONE=... BOOTSTRAP_DIRECTOR_PASSWORD=... \
 *   BOOTSTRAP_FINANCE_PHONE=...  BOOTSTRAP_FINANCE_PASSWORD=... \
 *   BOOTSTRAP_CASHIER_PHONE=...  BOOTSTRAP_CASHIER_PASSWORD=... \
 *   npm run bootstrap:users
 *
 * Idempotent: an account that already exists is left untouched, and a role
 * assignment that already exists is not duplicated. Passwords are never
 * printed, logged or written to disk. Run `npm run build` first — the bcrypt
 * helper is imported from dist/ so hashing matches the login path exactly.
 *
 * BOOTSTRAP_ALLOW_PASSWORD_RESET=true rewrites the password hash of accounts
 * that already exist. It is deliberately opt-in: without it a rerun never
 * changes a password, a role or a status.
 */
import { createRequire } from 'node:module';
import { PrismaClient } from '@prisma/client';

const require = createRequire(import.meta.url);
const { hashPassword } = require('../dist/auth/password.js');

/** Seeded system-process account; the grantor of record for bootstrap grants. */
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
const MIN_PASSWORD_LENGTH = 12;

/**
 * docs/PROJECT_REQUIREMENTS.md:64-66. Madina holds two functions at once, which
 * the approved model expresses as two separate role assignments on one account
 * — never as a combined role.
 */
const ROSTER = [
  {
    key: 'DIRECTOR',
    fullName: 'Ergashev Abdulla',
    grants: [{ role: 'director', branch: null }],
  },
  {
    key: 'FINANCE',
    fullName: 'Soyibjonova Madina',
    grants: [
      { role: 'finance_manager', branch: null },
      { role: 'cashier', branch: 'SAYXUN' },
    ],
  },
  {
    key: 'CASHIER',
    fullName: 'Mamurova Maftuna',
    grants: [{ role: 'cashier', branch: 'XALQLAR_DOSTLIGI' }],
  },
];

function abort(code, message) {
  console.error(`${code}\n  ${message}`);
  process.exit(1);
}

/** Same normalisation AuthService applies, so bootstrap and login agree. */
function normalizePhone(value) {
  return value.replace(/[\s()-]/g, '');
}

const inputs = ROSTER.map((person) => {
  const phone = (process.env[`BOOTSTRAP_${person.key}_PHONE`] ?? '').trim();
  const password = process.env[`BOOTSTRAP_${person.key}_PASSWORD`] ?? '';
  if (!phone)
    abort('BOOTSTRAP_INPUT_MISSING', `BOOTSTRAP_${person.key}_PHONE kerak (${person.fullName}).`);
  if (password.length < MIN_PASSWORD_LENGTH)
    abort(
      'BOOTSTRAP_PASSWORD_TOO_SHORT',
      `BOOTSTRAP_${person.key}_PASSWORD kamida ${MIN_PASSWORD_LENGTH} belgi bo‘lishi kerak.`,
    );
  return { ...person, phone: normalizePhone(phone), password };
});

const allowReset = process.env.BOOTSTRAP_ALLOW_PASSWORD_RESET === 'true';

const duplicates = inputs.map((i) => i.phone).filter((p, i, all) => all.indexOf(p) !== i);
if (duplicates.length > 0)
  abort('BOOTSTRAP_DUPLICATE_PHONE', 'Bir xil telefon raqam bir nechta foydalanuvchiga berilgan.');

const prisma = new PrismaClient();

try {
  const grantor = await prisma.users.findUnique({
    where: { id: SYSTEM_USER_ID },
    select: { id: true },
  });
  if (!grantor)
    abort('BOOTSTRAP_SYSTEM_USER_MISSING', 'Tizim akkaunti yo‘q — 002_seed_reference.sql ishga tushirilmagan.');

  const roles = new Map(
    (await prisma.roles.findMany({ select: { id: true, code: true, is_active: true } })).map((r) => [
      r.code,
      r,
    ]),
  );
  const branches = new Map(
    (await prisma.branches.findMany({ select: { id: true, code: true } })).map((b) => [b.code, b]),
  );

  for (const person of inputs) {
    for (const grant of person.grants) {
      const role = roles.get(grant.role);
      if (!role) abort('BOOTSTRAP_ROLE_MISSING', `'${grant.role}' roli bazada yo‘q.`);
      if (!role.is_active) abort('BOOTSTRAP_ROLE_INACTIVE', `'${grant.role}' roli nofaol.`);
      if (grant.branch && !branches.has(grant.branch))
        abort('BOOTSTRAP_BRANCH_MISSING', `'${grant.branch}' filiali bazada yo‘q.`);
    }
  }

  let created = 0;
  let skipped = 0;
  let grantsAdded = 0;
  let reset = 0;

  for (const person of inputs) {
    const existing = await prisma.users.findUnique({
      where: { phone: person.phone },
      select: {
        id: true,
        full_name: true,
        status: true,
        user_roles: {
          where: { is_active: true, revoked_at: null },
          select: { role_id: true, branch_id: true, role: { select: { code: true } } },
        },
      },
    });

    if (existing) {
      if (allowReset) {
        // Explicitly opted into: only the hash changes; roles and status stay.
        await prisma.users.update({
          where: { id: existing.id },
          data: { password_hash: await hashPassword(person.password) },
        });
        reset += 1;
        console.log(`RESET   ${person.fullName} — parol yangilandi (chop etilmaydi)`);
      }

      // Never touch an existing password or status; only fill in missing grants.
      const missing = person.grants.filter((grant) => {
        const role = roles.get(grant.role);
        const branchId = grant.branch ? branches.get(grant.branch).id : null;
        return !existing.user_roles.some(
          (held) => held.role_id === role.id && held.branch_id === branchId,
        );
      });

      if (missing.length === 0) {
        if (!allowReset) console.log(`SKIP    ${person.fullName} — mavjud, o‘zgartirilmadi`);
        skipped += 1;
        continue;
      }

      await prisma.$transaction(
        missing.map((grant) =>
          prisma.user_roles.create({
            data: {
              user_id: existing.id,
              role_id: roles.get(grant.role).id,
              branch_id: grant.branch ? branches.get(grant.branch).id : null,
              granted_by: grantor.id,
            },
            select: { id: true },
          }),
        ),
      );
      grantsAdded += missing.length;
      console.log(
        `GRANT   ${person.fullName} — ${missing.map((g) => g.role + (g.branch ? '@' + g.branch : '')).join(', ')} qo‘shildi`,
      );
      skipped += 1;
      continue;
    }

    const password_hash = await hashPassword(person.password);
    await prisma.$transaction(async (tx) => {
      const user = await tx.users.create({
        data: {
          full_name: person.fullName,
          phone: person.phone,
          email: null,
          password_hash,
          status: 'active',
          is_system: false,
        },
        select: { id: true },
      });
      for (const grant of person.grants) {
        await tx.user_roles.create({
          data: {
            user_id: user.id,
            role_id: roles.get(grant.role).id,
            // NULL only for all-branch roles; the database trigger enforces this.
            branch_id: grant.branch ? branches.get(grant.branch).id : null,
            granted_by: grantor.id,
          },
          select: { id: true },
        });
      }
    });
    created += 1;
    console.log(
      `CREATE  ${person.fullName} — ${person.grants.map((g) => g.role + (g.branch ? '@' + g.branch : '@barcha')).join(' + ')}`,
    );
  }

  console.log(`\nBOOTSTRAP_USERS_DONE  yaratildi=${created} o‘tkazildi=${skipped} yangi_grant=${grantsAdded} parol_yangilandi=${reset}`);
  console.log('Parollar chop etilmadi va hech qayerga yozilmadi.');
} catch (error) {
  const message = String(error?.message ?? error)
    .split('\n')[0]
    .replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[redacted]');
  abort('BOOTSTRAP_FAILED', message);
} finally {
  await prisma.$disconnect();
}
