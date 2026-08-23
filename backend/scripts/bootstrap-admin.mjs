/**
 * Creates the first real Director account.
 *
 * The approved seed (002_seed_reference.sql) deliberately ships only a disabled
 * system-process user, so a freshly initialised database has nobody who can log
 * in. This script closes that gap once, using the existing tables, the existing
 * `director` role and the existing bcrypt configuration. It creates no roles and
 * no permissions.
 *
 *   BOOTSTRAP_ADMIN_NAME="Ism Familiya" \
 *   BOOTSTRAP_ADMIN_LOGIN="admin@fincore.local" \
 *   BOOTSTRAP_ADMIN_PASSWORD="..." \
 *   npm run bootstrap:admin
 *
 * The password is read from the environment, never echoed, never logged and
 * never written to a file. Run `npm run build` first: the bcrypt helper is
 * imported from dist/ so hashing here is byte-for-byte what the login path uses.
 */
import { createRequire } from 'node:module';
import { PrismaClient } from '@prisma/client';

const require = createRequire(import.meta.url);
/** Reusing the compiled helper guarantees the same cost factor as AuthService. */
const { hashPassword } = require('../dist/auth/password.js');

/** Seeded system-process account; the only valid grantor before any human exists. */
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
const DIRECTOR_ROLE_CODE = 'director';
const MIN_PASSWORD_LENGTH = 12;

function abort(code, message) {
  console.error(`${code}\n  ${message}`);
  process.exit(1);
}

const name = (process.env.BOOTSTRAP_ADMIN_NAME ?? '').trim();
const login = (process.env.BOOTSTRAP_ADMIN_LOGIN ?? '').trim();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? '';
const allowReset = process.env.BOOTSTRAP_ALLOW_PASSWORD_RESET === 'true';

if (!name) abort('BOOTSTRAP_INPUT_MISSING', 'BOOTSTRAP_ADMIN_NAME kerak.');
if (!login) abort('BOOTSTRAP_INPUT_MISSING', 'BOOTSTRAP_ADMIN_LOGIN kerak (email yoki telefon).');
if (password.length < MIN_PASSWORD_LENGTH)
  abort(
    'BOOTSTRAP_PASSWORD_TOO_SHORT',
    `BOOTSTRAP_ADMIN_PASSWORD kamida ${MIN_PASSWORD_LENGTH} belgi bo‘lishi kerak.`,
  );

const isEmail = login.includes('@');
// Mirrors AuthService.normalizePhone so bootstrap and login agree on the identifier.
const identifier = isEmail
  ? { email: login.toLowerCase(), phone: null }
  : { email: null, phone: login.replace(/[\s()-]/g, '') };

const prisma = new PrismaClient();

try {
  const role = await prisma.roles.findUnique({
    where: { code: DIRECTOR_ROLE_CODE },
    select: { id: true, name: true, is_active: true, allows_all_branch_scope: true },
  });
  if (!role)
    abort('BOOTSTRAP_ROLE_MISSING', `'${DIRECTOR_ROLE_CODE}' roli topilmadi — seed ishga tushirilmagan.`);
  if (!role.is_active) abort('BOOTSTRAP_ROLE_INACTIVE', `'${DIRECTOR_ROLE_CODE}' roli nofaol.`);

  const grantor = await prisma.users.findUnique({
    where: { id: SYSTEM_USER_ID },
    select: { id: true },
  });
  if (!grantor)
    abort('BOOTSTRAP_SYSTEM_USER_MISSING', 'Tizim akkaunti topilmadi — 002_seed_reference.sql ishga tushirilmagan.');

  const existing = await prisma.users.findFirst({
    where: identifier.email ? { email: identifier.email } : { phone: identifier.phone },
    select: {
      id: true,
      full_name: true,
      status: true,
      user_roles: {
        where: { is_active: true, revoked_at: null },
        select: { role: { select: { code: true } } },
      },
    },
  });

  if (existing) {
    const hasDirector = existing.user_roles.some((item) => item.role.code === DIRECTOR_ROLE_CODE);

    if (allowReset) {
      if (!hasDirector)
        abort(
          'BOOTSTRAP_USER_EXISTS_WITHOUT_DIRECTOR_ROLE',
          'Parolni almashtirish faqat director roli bor foydalanuvchi uchun ruxsat etilgan.',
        );
      // Explicitly opted into: only the hash changes, roles and status untouched.
      await prisma.users.update({
        where: { id: existing.id },
        data: { password_hash: await hashPassword(password) },
      });
      console.log('BOOTSTRAP_PASSWORD_RESET');
      console.log(`  user id   : ${existing.id}`);
      console.log(`  login     : ${login}`);
      console.log('  parol     : yangilandi (chop etilmaydi)');
      process.exit(0);
    }

    if (hasDirector) {
      console.log('BOOTSTRAP_USER_ALREADY_EXISTS');
      console.log(`  user id   : ${existing.id}`);
      console.log(`  login     : ${login}`);
      console.log('  hech narsa o‘zgartirilmadi.');
      console.log('  Parolni almashtirish uchun: BOOTSTRAP_ALLOW_PASSWORD_RESET=true');
      process.exit(0);
    }

    abort(
      'BOOTSTRAP_USER_EXISTS_WITHOUT_DIRECTOR_ROLE',
      'Bu login mavjud, lekin director roli yo‘q. Ma’lumot o‘z-o‘zicha o‘zgartirilmaydi.',
    );
  }

  const password_hash = await hashPassword(password);
  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.users.create({
      data: {
        full_name: name,
        email: identifier.email,
        phone: identifier.phone,
        password_hash,
        status: 'active', // AuthService rejects anything else.
        is_system: false, // A human account, not a process account.
      },
      select: { id: true, full_name: true, status: true },
    });
    // branch_id stays NULL: the trigger allows it only for all-branch roles,
    // which is exactly what `director` is.
    await tx.user_roles.create({
      data: { user_id: user.id, role_id: role.id, branch_id: null, granted_by: grantor.id },
      select: { id: true },
    });
    return user;
  });

  const permissions = await prisma.role_permissions.count({ where: { role_id: role.id } });

  console.log('BOOTSTRAP_USER_CREATED');
  console.log(`  user id   : ${created.id}`);
  console.log(`  ism       : ${created.full_name}`);
  console.log(`  login     : ${login} (${isEmail ? 'email' : 'telefon'})`);
  console.log(`  status    : ${created.status}`);
  console.log(`  rol       : ${DIRECTOR_ROLE_CODE} (${permissions} ruxsat, barcha filiallar)`);
  console.log('  parol     : bcrypt bilan xeshlandi (chop etilmaydi)');
} catch (error) {
  const message = String(error?.message ?? error)
    .split('\n')[0]
    .replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[redacted]');
  abort('BOOTSTRAP_FAILED', message);
} finally {
  await prisma.$disconnect();
}
