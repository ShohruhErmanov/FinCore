/**
 * Creates the HMAC signing key the database uses to verify who performed a
 * write (fincore.fn_current_actor_id). The table fincore._actor_signing_keys
 * exists for exactly this and ships empty, so every audited INSERT/UPDATE fails
 * with "missing actor context" until a key is installed.
 *
 *   node --env-file=.env scripts/init-actor-key.mjs
 *
 * Prints the two .env lines to add. The key itself is shown ONCE and never
 * stored anywhere by this script — treat it like SESSION_SECRET.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
try {
  const existing = await prisma.$queryRaw`
    SELECT key_id FROM fincore._actor_signing_keys WHERE is_active AND retired_at IS NULL
  `;
  if (existing.length > 0) {
    console.log('ACTOR_KEY_ALREADY_PRESENT');
    console.log(`  faol kalit: ${existing[0].key_id}`);
    console.log('  Yangi kalit kerak bo‘lsa, avvalgisini retired_at bilan yoping.');
    process.exit(0);
  }

  const keyId = randomUUID();
  const key = randomBytes(32);

  await prisma.$executeRaw`
    INSERT INTO fincore._actor_signing_keys (key_id, hmac_key, is_active)
    VALUES (${keyId}::uuid, ${key}::bytea, true)
  `;

  console.log('ACTOR_KEY_CREATED');
  console.log('Quyidagi ikki qatorni backend/.env ga qo‘shing (bir marta ko‘rsatiladi):');
  console.log('');
  console.log(`ACTOR_SIGNING_KEY_ID=${keyId}`);
  console.log(`ACTOR_SIGNING_KEY=${key.toString('base64')}`);
} catch (error) {
  const message = String(error?.message ?? error).split('\n')[0].replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[redacted]');
  console.error('ACTOR_KEY_FAILED\n  ' + message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
