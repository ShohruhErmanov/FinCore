/* eslint-disable react-refresh/only-export-components */
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { referenceApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { Card, ErrorState, LoadingState, Select } from '@/shared/ui';

export function useRevenueReferences() {
  const branches = useQuery({
    queryKey: queryKeys.branches,
    queryFn: ({ signal }) => referenceApi.branches(signal),
    staleTime: 300_000,
  });
  const periods = useQuery({
    queryKey: queryKeys.periods,
    queryFn: ({ signal }) => referenceApi.periods(signal),
    staleTime: 60_000,
  });
  const paymentMethods = useQuery({
    queryKey: queryKeys.master('payment-methods'),
    queryFn: ({ signal }) => referenceApi.paymentMethods(signal),
    staleTime: 300_000,
  });
  const users = useQuery({
    queryKey: queryKeys.userDirectory,
    queryFn: ({ signal }) => referenceApi.users(signal),
    staleTime: 60_000,
  });
  return { branches, periods, paymentMethods, users };
}

export function ReferenceBoundary({
  queries,
  children,
}: {
  queries: Array<{ isLoading: boolean; isError: boolean; refetch: () => unknown }>;
  children: ReactNode;
}) {
  if (queries.some((query) => query.isLoading))
    return <LoadingState label="Filtr ma’lumotlari yuklanmoqda…" />;
  const failed = queries.find((query) => query.isError);
  if (failed)
    return (
      <ErrorState
        message="Filial, davr yoki to‘lov usullarini yuklab bo‘lmadi."
        onRetry={() => void failed.refetch()}
      />
    );
  return <>{children}</>;
}

export function FilterCard({
  children,
  title = 'Filtrlar',
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <Card title={title} className="mb-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
    </Card>
  );
}

export function NativeFilter({
  label,
  value,
  onChange,
  children,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  allLabel?: string | undefined;
}) {
  const id = `filter-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <label htmlFor={id} className="space-y-1.5">
      <span className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
        {label}
      </span>
      <Select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {allLabel ? <option value="all">{allLabel}</option> : null}
        {children}
      </Select>
    </label>
  );
}

export function numericPage(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function sumMoney(values: Array<string | null | undefined>): string {
  return values.reduce<bigint>((total, value) => total + BigInt(value ?? '0'), 0n).toString();
}

export function percentage(actual: string, plan: string): number | null {
  const denominator = BigInt(plan);
  if (denominator === 0n) return null;
  const numerator = BigInt(actual) * 10_000n;
  const isNegative = numerator < 0n !== denominator < 0n;
  const absoluteNumerator = numerator < 0n ? -numerator : numerator;
  const absoluteDenominator = denominator < 0n ? -denominator : denominator;
  const rounded = (absoluteNumerator + absoluteDenominator / 2n) / absoluteDenominator;
  return Number(isNegative ? -rounded : rounded) / 100;
}

export function gapMoney(plan: string, actual: string): string {
  return (BigInt(plan) - BigInt(actual)).toString();
}

export function querySignature(params: URLSearchParams): string {
  return [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}
