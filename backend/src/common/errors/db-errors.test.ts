import { describe, expect, it } from 'vitest';
import { ApiException } from './api-exception';
import { ACTOR_CONTEXT_RULE, errorMessage, translateDbError, type DbErrorRule } from './db-errors';

const RULES: readonly DbErrorRule[] = [
  [/period is closed/i, () => new ApiException(409, 'PERIOD_CLOSED', 'Davr yopiq.')],
  [/violates/i, () => new ApiException(422, 'REFERENCE_INVALID', 'Topilmadi.')],
  ACTOR_CONTEXT_RULE,
];

describe('translateDbError', () => {
  it('answers with the first rule whose pattern matches the message', () => {
    const translated = translateDbError(
      new Error('accounting period is closed; it violates the lock'),
      RULES,
    );
    expect(translated).toBeInstanceOf(ApiException);
    expect((translated as ApiException).code).toBe('PERIOD_CLOSED');
    expect((translated as ApiException).getStatus()).toBe(409);
  });

  it('maps the actor-signing failure to the shared 500 contract', () => {
    const translated = translateDbError(new Error('missing actor context'), RULES);
    expect((translated as ApiException).code).toBe('ACTOR_CONTEXT_INVALID');
    expect((translated as ApiException).getStatus()).toBe(500);
  });

  it('lets an ApiException through untouched, even if its message would match', () => {
    const original = new ApiException(403, 'FORBIDDEN', 'period is closed');
    expect(translateDbError(original, RULES)).toBe(original);
  });

  it('returns an unrecognised error as is, for the caller to rethrow', () => {
    const original = new Error('connection reset');
    expect(translateDbError(original, RULES)).toBe(original);
    expect(translateDbError('plain text', RULES)).toBe('plain text');
  });
});

describe('errorMessage', () => {
  it('reads an Error message and stringifies anything else', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage(42)).toBe('42');
  });
});
