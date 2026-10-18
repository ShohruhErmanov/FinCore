/**
 * A whole, non-negative so‘m amount. Money crosses the wire as a digit string:
 * a JS number would lose precision on a BIGINT amount.
 */
export const WHOLE_UZS_PATTERN = /^\d+$/;

/** A calendar date, YYYY-MM-DD. */
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The largest amount a BIGINT money column can hold. */
export const MAX_UZS = 9_223_372_036_854_775_807n;
