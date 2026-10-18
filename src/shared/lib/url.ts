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

type SearchParamsSetter = (
  nextInit: URLSearchParams,
  navigateOptions?: { replace?: boolean; state?: unknown; preventScrollReset?: boolean },
) => void;

export function updateSearchParam(
  current: URLSearchParams,
  setter: SearchParamsSetter,
  key: string,
  value: string,
): void {
  const next = new URLSearchParams(current);
  if (value) next.set(key, value);
  else next.delete(key);
  if (key !== 'page') next.delete('page');
  setter(next, { replace: true });
}
