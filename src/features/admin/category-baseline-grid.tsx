import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PencilLine, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { getApiErrorMessage } from '@/shared/api/client';
import { adminApi } from '@/shared/api/contracts';
import { invalidatePlanningAggregates } from '@/shared/api/invalidation';
import { queryKeys } from '@/shared/api/query-keys';
import type {
  CategoryBaselineInput,
  CategoryBaselineRow,
  ExpenseCategory,
  ExpenseType,
} from '@/shared/types/domain';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  CurrencyInput,
  LoadingState,
  Modal,
  MoneyText,
  Select,
} from '@/shared/ui';

/**
 * The Excel «Sozlamalar» grid: every category with one editable amount per
 * branch, a computed row total, and the «Jami oylik reja (byudjet)» footer.
 *
 * This is the director’s baseline plan, not the monthly budget — reports keep
 * reading budget lines. Totals are recomputed as you type, the way the
 * spreadsheet behaves, and only edited cells are sent on save.
 */
export function CategoryBaselineGrid() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const board = useQuery({
    queryKey: queryKeys.master('category-baselines'),
    queryFn: ({ signal }) => adminApi.categoryBaselines(signal),
  });

  const save = useMutation({
    mutationFn: (lines: CategoryBaselineInput[]) => adminApi.saveCategoryBaselines(lines),
    onSuccess: async () => {
      setDraft({});
      setError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.master('category-baselines') });
    },
    onError: (mutationError) => setError(getApiErrorMessage(mutationError)),
  });

  const cellKey = (categoryId: string, branchId: string) => `${categoryId}:${branchId}`;
  const valueOf = (categoryId: string, branchId: string, stored: string) =>
    draft[cellKey(categoryId, branchId)] ?? stored;

  const totals = useMemo(() => {
    const byBranch: Record<string, bigint> = {};
    const byRow: Record<string, bigint> = {};
    let grand = 0n;
    for (const branch of board.data?.branches ?? []) byBranch[branch.branchId] = 0n;
    for (const row of board.data?.rows.filter((item) => item.isActive !== showInactive) ?? []) {
      let rowTotal = 0n;
      for (const branch of board.data?.branches ?? []) {
        const raw =
          draft[cellKey(row.categoryId, branch.branchId)] ?? row.amounts[branch.branchId] ?? '0';
        const amount = /^\d+$/.test(raw) ? BigInt(raw) : 0n;
        rowTotal += amount;
        byBranch[branch.branchId] = (byBranch[branch.branchId] ?? 0n) + amount;
      }
      byRow[row.categoryId] = rowTotal;
      grand += rowTotal;
    }
    return { byBranch, byRow, grand };
  }, [board.data, draft, showInactive]);

  if (board.isLoading) return <LoadingState label="Boshlang‘ich reja yuklanmoqda…" />;
  if (board.isError)
    return (
      <ErrorState message={getApiErrorMessage(board.error)} onRetry={() => void board.refetch()} />
    );
  if (!board.data) return null;

  const { branches } = board.data;
  const rows = board.data.rows.filter((row) => row.isActive !== showInactive);
  const inactiveCount = board.data.rows.filter((row) => !row.isActive).length;
  const dirty = Object.keys(draft).length > 0;

  const submit = () => {
    const lines: CategoryBaselineInput[] = [];
    for (const [key, raw] of Object.entries(draft)) {
      if (!/^\d+$/.test(raw))
        return setError('Summalar manfiy bo\u2018lmagan butun so\u2018mda bo\u2018lsin.');
      const [categoryId, branchId] = key.split(':');
      lines.push({ categoryId: categoryId!, branchId: branchId!, amountUzs: raw });
    }
    setError(null);
    save.mutate(lines);
  };

  return (
    <Card
      title="Boshlang‘ich oylik reja"
      description="Har kategoriya uchun filial bo‘yicha summa. Jami ustuni va pastdagi yakuniy qator avtomatik hisoblanadi."
      className="mb-5"
      actions={
        <Button onClick={submit} loading={save.isPending} disabled={!dirty || showInactive}>
          <Save className="h-4 w-4" /> Saqlash
        </Button>
      }
    >
      {error ? (
        <Alert title="Saqlanmadi" tone="danger" className="mb-4">
          {error}
        </Alert>
      ) : null}
      {save.isSuccess && !dirty ? (
        <Alert title="Saqlandi" tone="success" className="mb-4">
          Boshlang‘ich reja yangilandi.
        </Alert>
      ) : null}
      <div
        className="mb-4 flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Kategoriya holati"
      >
        <Button
          size="sm"
          variant={showInactive ? 'secondary' : 'primary'}
          onClick={() => setShowInactive(false)}
        >
          Faol kategoriyalar
        </Button>
        <Button
          size="sm"
          variant={showInactive ? 'primary' : 'secondary'}
          onClick={() => setShowInactive(true)}
        >
          Nofaol kategoriyalar ({inactiveCount})
        </Button>
      </div>
      {showInactive ? (
        <p className="mb-4 text-xs text-muted">
          Nofaol kategoriyalar yangi xarajatlarga tanlanmaydi. Quyidagi summalar tarixiy reja
          sifatida saqlanadi.
        </p>
      ) : null}
      {!rows.length ? (
        <EmptyState
          description={
            showInactive
              ? 'Nofaol kategoriyalar yo‘q.'
              : 'Faol kategoriyalar yo‘q. Yangi kategoriya qo‘shing.'
          }
        />
      ) : (
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">Boshlang‘ich oylik reja</caption>
            <thead>
              <tr className="border-b border-border bg-canvas/70">
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  Kategoriya
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  Turi
                </th>
                {branches.map((branch) => (
                  <th
                    key={branch.branchId}
                    scope="col"
                    className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600"
                  >
                    Boshlang‘ich {branch.name}
                  </th>
                ))}
                <th
                  scope="col"
                  className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  Boshlang‘ich jami
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.categoryId} className="border-b border-border/70 last:border-0">
                  <td className="min-w-64 px-4 py-2.5">
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="block break-words font-medium text-ink">{row.name}</span>
                        {row.isActive ? null : <span className="text-xs text-muted">Nofaol</span>}
                      </div>
                      <CategoryActions
                        row={row}
                        onArchived={() =>
                          setDraft((current) =>
                            Object.fromEntries(
                              Object.entries(current).filter(
                                ([key]) => !key.startsWith(`${row.categoryId}:`),
                              ),
                            ),
                          )
                        }
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted">
                    {row.expenseType === 'fixed' ? 'Doimiy' : 'O\u2018zgaruvchan'}
                  </td>
                  {branches.map((branch) => (
                    <td key={branch.branchId} className="px-4 py-2.5 text-right">
                      <CurrencyInput
                        aria-label={`${row.name} — ${branch.name}`}
                        className="w-40 text-right"
                        disabled={!row.isActive}
                        value={valueOf(
                          row.categoryId,
                          branch.branchId,
                          row.amounts[branch.branchId] ?? '0',
                        )}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            [cellKey(row.categoryId, branch.branchId)]: event.target.value.replace(
                              /\D/g,
                              '',
                            ),
                          }))
                        }
                      />
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right font-semibold text-ink">
                    <MoneyText value={(totals.byRow[row.categoryId] ?? 0n).toString()} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-canvas/70">
                <th scope="row" colSpan={2} className="px-4 py-3 text-left font-semibold text-ink">
                  {showInactive ? 'Nofaol kategoriyalar jami:' : 'Jami faol oylik reja:'}
                </th>
                {branches.map((branch) => (
                  <td key={branch.branchId} className="px-4 py-3 text-right font-semibold text-ink">
                    <MoneyText value={(totals.byBranch[branch.branchId] ?? 0n).toString()} />
                  </td>
                ))}
                <td className="px-4 py-3 text-right text-base font-bold text-ink">
                  <MoneyText value={totals.grand.toString()} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}

function CategoryActions({
  row,
  onArchived,
}: {
  row: CategoryBaselineRow;
  onArchived: () => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState(row.name);
  const [expenseType, setExpenseType] = useState<ExpenseType>(row.expenseType);
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (body: { name?: string; expenseType?: ExpenseType; isActive?: boolean }) =>
      adminApi.updateMaster<ExpenseCategory>('categories', row.categoryId, body),
    onSuccess: async (_updated, body) => {
      setEditing(false);
      setConfirmDelete(false);
      setError(null);
      if (body.isActive === false) onArchived();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.master('categories') }),
        queryClient.invalidateQueries({ queryKey: queryKeys.master('category-baselines') }),
        queryClient.invalidateQueries({ queryKey: queryKeys.expenseAnalyticsRoot }),
        invalidatePlanningAggregates(queryClient),
      ]);
    },
    onError: (mutationError) => {
      setError(getApiErrorMessage(mutationError));
      setConfirmDelete(false);
    },
  });
  const saveEdit = () => {
    const cleanName = name.trim();
    if (cleanName.length < 2 || cleanName.length > 200) {
      setError('Kategoriya nomi 2–200 belgi bo‘lsin.');
      return;
    }
    setError(null);
    mutation.mutate({ name: cleanName, expenseType });
  };
  const closeEditing = useCallback(() => {
    if (!mutation.isPending) setEditing(false);
  }, [mutation.isPending]);
  const closeDelete = useCallback(() => {
    if (!mutation.isPending) setConfirmDelete(false);
  }, [mutation.isPending]);
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      {row.isActive ? (
        <div className="neu-inset inline-flex items-center gap-0.5 rounded-xl p-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 min-h-9 w-9 rounded-lg px-0 text-slate-500 hover:bg-raised hover:text-blue-700 hover:shadow-[var(--neu-shadow-xs)] active:shadow-[var(--neu-pressed)]"
            onClick={() => {
              setName(row.name);
              setExpenseType(row.expenseType);
              setError(null);
              setEditing(true);
            }}
            aria-label={`${row.name} kategoriyasini tahrirlash`}
            title="Tahrirlash"
          >
            <PencilLine className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 min-h-9 w-9 rounded-lg px-0 text-slate-500 hover:bg-red-50 hover:text-red-700"
            onClick={() => {
              setError(null);
              setConfirmDelete(true);
            }}
            aria-label={`${row.name} kategoriyasini o‘chirish`}
            title="O‘chirish"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 min-h-9 rounded-lg neu-raised-sm px-2 text-slate-600 hover:bg-raised hover:text-blue-700"
          loading={mutation.isPending}
          onClick={() => mutation.mutate({ isActive: true })}
          aria-label={`${row.name} kategoriyasini qayta faollashtirish`}
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" /> Tiklash
        </Button>
      )}
      {error && !editing && !confirmDelete ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
      <Modal
        open={editing}
        onClose={closeEditing}
        title="Kategoriyani tahrirlash"
        description={`${row.code} · kod o‘zgarmaydi, tarixiy yozuvlar saqlanadi.`}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              disabled={mutation.isPending}
              onClick={() => setEditing(false)}
            >
              Bekor qilish
            </Button>
            <Button loading={mutation.isPending} onClick={saveEdit}>
              Saqlash
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <FormField label="Kategoriya nomi" htmlFor={`category-name-${row.categoryId}`} required>
            <Input
              id={`category-name-${row.categoryId}`}
              value={name}
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
            />
          </FormField>
          <FormField label="Xarajat turi" htmlFor={`category-type-${row.categoryId}`} required>
            <Select
              id={`category-type-${row.categoryId}`}
              value={expenseType}
              onChange={(event) => setExpenseType(event.target.value as ExpenseType)}
            >
              <option value="fixed">Doimiy</option>
              <option value="variable">O‘zgaruvchan</option>
            </Select>
          </FormField>
          {error ? (
            <Alert title="Saqlanmadi" tone="danger">
              {error}
            </Alert>
          ) : null}
        </div>
      </Modal>
      <ConfirmDialog
        open={confirmDelete}
        onClose={closeDelete}
        onConfirm={() => mutation.mutate({ isActive: false })}
        title="Kategoriyani o‘chirish"
        description={`“${row.name}” faol ro‘yxatdan chiqariladi. Tarixiy xarajatlar va budjet yozuvlari o‘chirilmaydi; kategoriyani keyin qayta faollashtirish mumkin.`}
        confirmLabel="O‘chirish"
        pending={mutation.isPending}
        danger
      />
    </div>
  );
}
