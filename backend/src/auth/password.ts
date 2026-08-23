import * as bcrypt from 'bcryptjs';

/**
 * Cost 12 ≈ 250 ms on current server hardware — slow enough to make offline
 * cracking expensive, fast enough for an interactive login.
 */
const COST = 12;

/** Compared against when no user matched, so a wrong login and a wrong password take the same time. */
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEe.b2zzZ8CvJmJvXQ8H1L1w2ZuxJ2XZ1Ue';

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Burns the same CPU time as a real verification without revealing that the user is unknown. */
export async function burnPasswordTiming(plain: string): Promise<void> {
  await bcrypt.compare(plain, DUMMY_HASH).catch(() => false);
}
