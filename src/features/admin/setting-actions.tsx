import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PencilLine, Power } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { getApiErrorMessage } from '@/shared/api/client';
import { adminApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import type { ExpenseType } from '@/shared/types/domain';
import { Alert, Button, Card, FormField, Input, Select } from '@/shared/ui';
import { SETTING_META, type SettingKind, type SettingRow } from './settings-config';

export function CreateSettingPanel({ kind, onClose }: { kind: SettingKind; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [expenseType, setExpenseType] = useState<ExpenseType>('variable');
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      adminApi.createMaster<SettingRow>(kind, {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        ...(kind === 'categories' ? { expenseType } : {}),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.master(kind) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.reportRoot }),
        ...(kind === 'categories'
          ? [queryClient.invalidateQueries({ queryKey: queryKeys.master('category-baselines') })]
          : []),
        // Creating a branch also widens the creator’s own scope on the server,
        // so the cached session and the scoped branch list behind the top bar
        // are both stale the moment this returns.
        ...(kind === 'branches'
          ? [
              queryClient.invalidateQueries({ queryKey: queryKeys.branches }),
              queryClient.invalidateQueries({ queryKey: queryKeys.me }),
            ]
          : []),
      ]);
      onClose();
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(code.trim().toUpperCase()))
      return setError('Kod A–Z bilan boshlanib, faqat A–Z, raqam va _ dan iborat bo‘lsin.');
    if (name.trim().length < 2) return setError('Nomni kiriting.');
    setError(null);
    mutation.mutate();
  };
  return (
    <Card title={`Yangi ${SETTING_META[kind].singular}`} className="mb-5">
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <FormField label="Kod" htmlFor={`${kind}-code`} required>
          <Input
            id={`${kind}-code`}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="MASALAN_CODE"
          />
        </FormField>
        <FormField label="Nomi" htmlFor={`${kind}-name`} required>
          <Input
            id={`${kind}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </FormField>
        {kind === 'categories' ? (
          <FormField label="Xarajat turi" htmlFor="category-expense-type" required>
            <Select
              id="category-expense-type"
              value={expenseType}
              onChange={(event) => setExpenseType(event.target.value as ExpenseType)}
            >
              <option value="fixed">Doimiy</option>
              <option value="variable">O‘zgaruvchan</option>
            </Select>
          </FormField>
        ) : null}
        {error ? (
          <Alert title="Formani tekshiring" tone="danger" className="md:col-span-2">
            {error}
          </Alert>
        ) : null}
        {mutation.isError ? (
          <Alert title="Saqlab bo‘lmadi" tone="danger" className="md:col-span-2">
            {getApiErrorMessage(mutation.error)}
          </Alert>
        ) : null}
        <div className="flex justify-end gap-2 md:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Saqlash
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function SettingActions({ kind, row }: { kind: SettingKind; row: SettingRow }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(row.name);
  const [expenseType, setExpenseType] = useState<ExpenseType>(
    'expenseType' in row ? row.expenseType : 'variable',
  );
  const mutation = useMutation({
    mutationFn: (body: { isActive?: boolean; name?: string; expenseType?: ExpenseType }) =>
      adminApi.updateMaster<SettingRow>(kind, row.id, body),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.master(kind) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.reportRoot }),
      ]);
      setEditing(false);
    },
  });
  if (editing) {
    return (
      <div className="flex min-w-72 flex-wrap items-center justify-end gap-2">
        <label className="sr-only" htmlFor={`edit-${row.id}-name`}>
          Yangi nom
        </label>
        <Input
          id={`edit-${row.id}-name`}
          className="max-w-48"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        {kind === 'categories' ? (
          <Select
            aria-label="Yangi xarajat turi"
            className="max-w-40"
            value={expenseType}
            onChange={(event) => setExpenseType(event.target.value as ExpenseType)}
          >
            <option value="fixed">Doimiy</option>
            <option value="variable">O‘zgaruvchan</option>
          </Select>
        ) : null}
        <Button
          size="sm"
          loading={mutation.isPending}
          disabled={name.trim().length < 2}
          onClick={() =>
            mutation.mutate({
              name: name.trim(),
              ...(kind === 'categories' ? { expenseType } : {}),
            })
          }
        >
          Saqlash
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
          Bekor
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setEditing(true)}
        title="Nom yoki turni tahrirlash"
      >
        <PencilLine className="h-4 w-4" />
        <span className="sr-only">Tahrirlash</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        loading={mutation.isPending}
        onClick={() => {
          if (
            !row.isActive ||
            window.confirm(
              'Nofaol qilish yangi tanlovlardan yashiradi, lekin tarixiy hisobotlarni o‘zgartirmaydi. Davom etilsinmi?',
            )
          )
            mutation.mutate({ isActive: !row.isActive });
        }}
        title={row.isActive ? 'Nofaol qilish' : 'Faollashtirish'}
      >
        <Power className="h-4 w-4" />
        <span className="sr-only">{row.isActive ? 'Nofaol qilish' : 'Faollashtirish'}</span>
      </Button>
    </div>
  );
}
