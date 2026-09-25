/**
 * Creates the first human Business Owner through the trusted bootstrap path.
 * The ordinary Users API deliberately rejects this role.
 *
 *   BOOTSTRAP_OWNER_NAME="Ism Familiya" \
 *   BOOTSTRAP_OWNER_LOGIN="owner@example.com" \
 *   BOOTSTRAP_OWNER_PASSWORD="..." \
 *   npm run bootstrap:owner
 *
 * The password is never printed or written to disk. Existing accounts are
 * left untouched unless BOOTSTRAP_ALLOW_PASSWORD_RESET=true and the account
 * already holds business_owner.
 */
import { createRequire } from 'node:module';
import { PrismaClient } from '@prisma/client';

const require = createRequire(import.meta.url);
const { hashPassword } = require('../dist/auth/password.js');

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
const ROLE_CODE = 'business_owner';
const MIN_PASSWORD_LENGTH = 12;

function abort(code, message) {
  console.error(`${code}\n  ${message}`);
  process.exit(1);
}

const name = (process.env.BOOTSTRAP_OWNER_NAME ?? '').trim();
const login = (process.env.BOOTSTRAP_OWNER_LOGIN ?? '').trim();
const password = process.env.BOOTSTRAP_OWNER_PASSWORD ?? '';
const allowReset = process.env.BOOTSTRAP_ALLOW_PASSWORD_RESET === 'true';

if (!name) abort('BOOTSTRAP_INPUT_MISSING', 'BOOTSTRAP_OWNER_NAME kerak.');
if (!login) abort('BOOTSTRAP_INPUT_MISSING', 'BOOTSTRAP_OWNER_LOGIN kerak.');
if (password.length < MIN_PASSWORD_LENGTH)
  abort(
    'BOOTSTRAP_PASSWORD_TOO_SHORT',
    `BOOTSTRAP_OWNER_PASSWORD kamida ${MIN_PASSWORD_LENGTH} belgi bo‘lishi kerak.`,
  );

const isEmail = login.includes('@');
const identifier = isEmail
  ? { email: login.toLowerCase(), phone: null }
  : { email: null, phone: login.replace(/[\s()-]/g, '') };
const prisma = new PrismaClient();

try {
  const role = await prisma.roles.findUnique({
    where: { code: ROLE_CODE },
    select: {
      id: true,
      is_active: true,
      allows_all_branch_scope: true,
      allows_branchless_scope: true,
    },
  });
  if (!role)
    abort('BOOTSTRAP_ROLE_MISSING', `'${ROLE_CODE}' roli topilmadi — 020 apply qilinmagan.`);
  if (!role.is_active || !role.allows_all_branch_scope || role.allows_branchless_scope)
    abort(
      'BOOTSTRAP_ROLE_INVALID',
      `'${ROLE_CODE}' scope sozlamalari xavfsizlik siyosatiga mos emas.`,
    );

  const grantor = await prisma.users.findUnique({
    where: { id: SYSTEM_USER_ID },
    select: { id: true },
  });
  if (!grantor) abort('BOOTSTRAP_SYSTEM_USER_MISSING', 'Tizim aktori topilmadi.');

  const existing = await prisma.users.findFirst({
    where: identifier.email ? { email: identifier.email } : { phone: identifier.phone },
    select: {
      id: true,
      user_roles: {
        where: { is_active: true, revoked_at: null },
        select: { role: { select: { code: true } } },
      },
    },
  });
  if (existing) {
    const isOwner = existing.user_roles.some((item) => item.role.code === ROLE_CODE);
    if (!isOwner)
      abort(
        'BOOTSTRAP_USER_EXISTS_WITHOUT_OWNER_ROLE',
        'Bu login mavjud, lekin Business Owner roli yo‘q; avtomatik privilege escalation qilinmaydi.',
      );
    if (!allowReset) {
      console.log('BOOTSTRAP_OWNER_ALREADY_EXISTS — hech narsa o‘zgartirilmadi.');
      process.exit(0);
    }
    await prisma.users.update({
      where: { id: existing.id },
      data: { password_hash: await hashPassword(password) },
    });
    console.log('BOOTSTRAP_OWNER_PASSWORD_RESET — parol chop etilmadi.');
    process.exit(0);
  }

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.users.create({
      data: {
        full_name: name,
        email: identifier.email,
        phone: identifier.phone,
        password_hash: await hashPassword(password),
        status: 'active',
        is_system: false,
      },
      select: { id: true },
    });
    await tx.user_roles.create({
      data: {
        user_id: user.id,
        role_id: role.id,
        branch_id: null,
        granted_by: grantor.id,
      },
      select: { id: true },
    });
    return user;
  });

  console.log(`BOOTSTRAP_OWNER_CREATED — user=${created.id}; parol chop etilmadi.`);
} catch (error) {
  const message = String(error?.message ?? error)
    .split('\n')[0]
    .replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[redacted]');
  abort('BOOTSTRAP_OWNER_FAILED', message);
} finally {
  await prisma.$disconnect();
}
