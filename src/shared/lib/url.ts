export function toSearchParams(
  values: Record<string, string | number | boolean | null | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  return params;
}

export function drilldownUrl(pathname: string, search: Record<string, string>): string {
  const params = toSearchParams(search);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
