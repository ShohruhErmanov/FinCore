/** A list filter of "all" or an empty string means "do not filter". */
export function optionalFilter(value: string | undefined): string | undefined {
  return !value || value === 'all' ? undefined : value;
}
