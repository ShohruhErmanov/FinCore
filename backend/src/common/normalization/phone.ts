/** Converts every supported human-entered phone representation to its lookup form. */
export function normalizePhone(value: string): string {
  return value.replace(/[\s()-]/g, '');
}
