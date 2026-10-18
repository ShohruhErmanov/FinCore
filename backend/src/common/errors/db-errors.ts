import { ApiException } from './api-exception';

/**
 * One translation rule: when a database error's message matches the pattern,
 * the API answers with the exception the factory builds. Rules are tried in
 * order, so a narrow pattern goes before a broad one.
 */
export type DbErrorRule = readonly [pattern: RegExp, toApiError: () => ApiException];

/** The actor-signing failure any audited write can hit. */
export const ACTOR_CONTEXT_RULE: DbErrorRule = [
  /actor context|signing key/i,
  () =>
    new ApiException(500, 'ACTOR_CONTEXT_INVALID', 'Server identifikatsiya konteksti noto‘g‘ri.'),
];

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Turns a database error into the API error of its first matching rule. An
 * ApiException passes through untouched, and an error no rule recognises is
 * returned as is, for the caller to rethrow.
 */
export function translateDbError(error: unknown, rules: readonly DbErrorRule[]): unknown {
  if (error instanceof ApiException) return error;
  const message = errorMessage(error);
  const rule = rules.find(([pattern]) => pattern.test(message));
  return rule ? rule[1]() : error;
}
