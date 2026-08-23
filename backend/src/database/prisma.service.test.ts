import { describe, expect, it } from 'vitest';
import { redactConnectionString } from './prisma.service';

describe('redactConnectionString', () => {
  it('strips credentials out of a Prisma error message', () => {
    const raw =
      'Cannot reach database at postgresql://fincore_service:s3cr3t@db.internal:5432/fincore?schema=fincore';
    const safe = redactConnectionString(raw);
    expect(safe).not.toContain('s3cr3t');
    expect(safe).not.toContain('fincore_service');
    expect(safe).toContain('postgres://[redacted]');
  });

  it('redacts both url schemes', () => {
    expect(redactConnectionString('postgres://u:p@h/db')).toBe('postgres://[redacted]');
    expect(redactConnectionString('POSTGRESQL://u:p@h/db')).toBe('postgres://[redacted]');
  });

  it('leaves text without a connection string untouched', () => {
    expect(redactConnectionString('Connection timed out')).toBe('Connection timed out');
  });
});
