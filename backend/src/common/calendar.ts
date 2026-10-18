/** Uzbek month names, January first — the labels every report and period carries. */
export const MONTHS_UZ: readonly string[] = [
  'Yanvar',
  'Fevral',
  'Mart',
  'Aprel',
  'May',
  'Iyun',
  'Iyul',
  'Avgust',
  'Sentabr',
  'Oktabr',
  'Noyabr',
  'Dekabr',
];

/** Three-letter forms for chart axes and dense tables. */
export const MONTHS_SHORT_UZ: readonly string[] = [
  'Yan',
  'Fev',
  'Mar',
  'Apr',
  'May',
  'Iyn',
  'Iyl',
  'Avg',
  'Sen',
  'Okt',
  'Noy',
  'Dek',
];

/** "Avgust" for 8; the bare number if the month is out of range. */
export function monthNameUz(month: number): string {
  return MONTHS_UZ[month - 1] ?? String(month);
}

/** "Avg" for 8; the bare number if the month is out of range. */
export function monthShortNameUz(month: number): string {
  return MONTHS_SHORT_UZ[month - 1] ?? String(month);
}

/** "Avgust 2026": how an accounting period is named in API payloads. */
export function periodLabelUz(year: number, month: number): string {
  return `${monthNameUz(month)} ${year}`;
}

/** Days in a calendar month, so a 31st never leaks into a 30-day comparison. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
