import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, ShieldAlert, Upload } from 'lucide-react';
import { useState } from 'react';
import { getApiErrorMessage } from '@/shared/api/client';
import { authApi, importApi, referenceApi } from '@/shared/api/contracts';
import { invalidateExpenseAggregates } from '@/shared/api/invalidation';
import { queryKeys } from '@/shared/api/query-keys';
import { downloadCsv } from '@/shared/lib/csv';
import { formatDate, formatMoney } from '@/shared/lib/format';
import type { ImportSummary } from '@/shared/types/domain';
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  MoneyText,
  PageHeader,
} from '@/shared/ui';
import {
  mergeResults,
  normalizeKassaRows,
  type ImportReference,
  type ImportResult,
} from './excel-import';
import { HEADER_ROWS, readKassaSheets } from './read-workbook';

function KpiTile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-card border border-border bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${tone ?? 'text-ink'}`}>{value}</p>
    </div>
  );
}

export function ImportPage() {
  const queryClient = useQueryClient();
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const me = useQuery({ queryKey: queryKeys.me, queryFn: ({ signal }) => authApi.me(signal) });
  const branches = useQuery({
    queryKey: queryKeys.branches,
    queryFn: ({ signal }) => referenceApi.branches(signal),
  });
  const categories = useQuery({
    queryKey: queryKeys.master('categories'),
    queryFn: ({ signal }) => referenceApi.categories(signal),
  });
  const paymentMethods = useQuery({
    queryKey: queryKeys.master('payment-methods'),
    queryFn: ({ signal }) => referenceApi.paymentMethods(signal),
  });
  const departments = useQuery({
    queryKey: queryKeys.master('departments'),
    queryFn: ({ signal }) => referenceApi.departments(signal),
  });
  const users = useQuery({
    queryKey: queryKeys.userDirectory,
    queryFn: ({ signal }) => referenceApi.users(signal),
  });

  const references = [me, branches, categories, paymentMethods, departments, users];
  const referencesReady = references.every((query) => query.data !== undefined);
  const referenceError = references.find((query) => query.isError)?.error;

  const importMutation = useMutation({
    mutationFn: () => importApi.expenses(preview?.rows ?? []),
    onSuccess: async (result) => {
      setSummary(result);
      setPreview(null);
      await invalidateExpenseAggregates(queryClient);
      await queryClient.invalidateQueries({ queryKey: ['budget'] });
    },
  });

  async function handleFile(file: File) {
    setParsing(true);
    setParseError(null);
    setSummary(null);
    setPreview(null);
    setFileName(file.name);
    try {
      const refs: ImportReference = {
        branches: branches.data ?? [],
        categories: categories.data ?? [],
        paymentMethods: paymentMethods.data ?? [],
        departments: departments.data ?? [],
        users: users.data ?? [],
        fallbackUserId: me.data?.id ?? '',
      };
      const sheets = await readKassaSheets(file);
      if (sheets.length === 0) {
        setParseError(
          'Faylda «Sayxun_kassa» yoki «Xalqlar_kassa» varag‘i topilmadi. To‘g‘ri Excel faylni tanlang.',
        );
        return;
      }
      setPreview(
        mergeResults(
          sheets.map((sheet) =>
            normalizeKassaRows(sheet.name, sheet.rows, refs, HEADER_ROWS + 1),
          ),
        ),
      );
    } catch (error) {
      setParseError(
        error instanceof Error ? error.message : 'Faylni o‘qib bo‘lmadi. Format .xlsx ekanini tekshiring.',
      );
    } finally {
      setParsing(false);
    }
  }

  const totalUzs = (preview?.rows ?? []).reduce((total, row) => total + BigInt(row.amountUzs), 0n);
  const errors = (preview?.issues ?? []).filter((issue) => issue.severity === 'error');
  const notes = (preview?.issues ?? []).filter((issue) => issue.severity === 'info');

  return (
    <div>
      <Breadcrumbs items={[{ label: 'Boshqaruv' }, { label: 'Excel’dan import', current: true }]} />
      <PageHeader
        title="Excel’dan import"
        description="«Moliya reja .xlsx» faylidagi kassa varaqlarini bir marta ko‘chirish. Matn formatidagi sanalar ham tiklanadi."
      />

      <Alert title="Qanday ishlaydi" tone="info" className="mb-5">
        Fayldagi <strong>Sayxun_kassa</strong> va <strong>Xalqlar_kassa</strong> varaqlari
        o‘qiladi — Jurnal emas, chunki Jurnal QUERY formulasi orqali yig‘iladi va matn
        formatidagi sanalarni tashlab ketadi. Import avval faqat ko‘rib chiqish uchun
        ko‘rsatiladi; tasdiqlamaguningizcha hech narsa saqlanmaydi.
      </Alert>

      {!referencesReady && !referenceError ? <LoadingState label="Ma’lumotnomalar yuklanmoqda…" /> : null}
      {referenceError ? <ErrorState message={getApiErrorMessage(referenceError)} /> : null}

      {referencesReady ? (
        <Card title="1-qadam · Faylni tanlang" className="mb-5">
          <label className="flex cursor-pointer flex-col items-center gap-3 rounded-card border-2 border-dashed border-border p-8 text-center hover:border-blue-300 hover:bg-blue-50/40">
            <FileSpreadsheet className="h-8 w-8 text-primary" />
            <span className="text-sm font-semibold text-ink">
              .xlsx faylni tanlash uchun bosing
            </span>
            <span className="text-xs text-muted">
              {fileName ?? 'Masalan: Moliya reja .xlsx'}
            </span>
            <input
              type="file"
              accept=".xlsx"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
                event.target.value = '';
              }}
            />
          </label>
          {parsing ? <LoadingState label="Fayl o‘qilmoqda…" /> : null}
          {parseError ? (
            <Alert title="Faylni o‘qib bo‘lmadi" tone="danger" className="mt-4">
              {parseError}
            </Alert>
          ) : null}
        </Card>
      ) : null}

      {preview ? (
        <Card
          title="2-qadam · Ko‘rib chiqish"
          description="Quyidagi yozuvlar import qilinadi. Hali hech narsa saqlanmadi."
          className="mb-5"
          actions={
            <Button
              loading={importMutation.isPending}
              disabled={preview.rows.length === 0}
              onClick={() => importMutation.mutate()}
            >
              <Upload className="h-4 w-4" /> {preview.rows.length} ta yozuvni import qilish
            </Button>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiTile label="Import qilinadi" value={String(preview.rows.length)} />
            <KpiTile
              label="Tiklangan matn sanalar"
              value={String(preview.recoveredCount)}
              tone={preview.recoveredCount > 0 ? 'text-success' : 'text-ink'}
            />
            <KpiTile
              label="Import qilinmaydi"
              value={String(errors.length)}
              tone={errors.length > 0 ? 'text-danger' : 'text-ink'}
            />
            <KpiTile label="Jami summa" value={formatMoney(totalUzs.toString(), true)} />
          </div>

          {preview.recoveredCount > 0 ? (
            <Alert title="Excel yo‘qotgan yozuvlar topildi" tone="success" className="mt-5">
              <strong>{preview.recoveredCount} ta</strong> yozuvning sanasi matn formatida
              saqlangan — Excel’dagi Jurnal ularni tashlab ketgan. Import ularni ham qo‘shadi.
            </Alert>
          ) : null}

          {importMutation.isError ? (
            <Alert title="Import bajarilmadi" tone="danger" className="mt-5">
              {getApiErrorMessage(importMutation.error)}
            </Alert>
          ) : null}

          <div className="-mx-5 mt-5 overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <caption className="sr-only">Import qilinadigan yozuvlar</caption>
              <thead>
                <tr className="border-y border-border bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <th className="px-4 py-3 text-left">Manba</th>
                  <th className="px-4 py-3 text-left">Sana</th>
                  <th className="px-4 py-3 text-left">Filial</th>
                  <th className="px-4 py-3 text-left">Kategoriya</th>
                  <th className="px-4 py-3 text-left">Tavsif</th>
                  <th className="px-4 py-3 text-right">Summa</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 25).map((row) => (
                  <tr
                    key={`${row.sourceSheet}-${row.sourceRow}`}
                    className={`border-b border-border last:border-0 ${row.recoveredTextDate ? 'bg-green-50/60' : ''}`}
                  >
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-muted">
                      {row.sourceSheet}:{row.sourceRow}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2">
                      {formatDate(row.transactionDate)}
                      {row.recoveredTextDate ? (
                        <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-800">
                          tiklandi
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2">{row.branchName}</td>
                    <td className="px-4 py-2">{row.categoryName}</td>
                    <td className="px-4 py-2">{row.description}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right font-semibold">
                      <MoneyText value={row.amountUzs} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rows.length > 25 ? (
            <p className="mt-3 text-xs text-muted">
              Yuqorida birinchi 25 tasi ko‘rsatilgan. Import barcha {preview.rows.length} tasini
              qamrab oladi.
            </p>
          ) : null}

          {errors.length > 0 ? (
            <div className="mt-6 rounded-card border border-amber-200 bg-amber-50/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-amber-900">
                  <ShieldAlert className="h-4 w-4" /> {errors.length} ta qator import
                  qilinmaydi
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    downloadCsv('import-muammolari', [
                      ['Daraja', 'Varaq', 'Qator', 'Maydon', 'Qiymat', 'Sabab'],
                      ...preview.issues.map((issue) => [
                        issue.severity === 'error' ? 'Xato' : 'Ogohlantirish',
                        issue.sourceSheet,
                        issue.sourceRow,
                        issue.field,
                        issue.value,
                        issue.message,
                      ]),
                    ])
                  }
                >
                  CSV yuklab olish
                </Button>
              </div>
              <ul className="mt-3 space-y-1 text-sm text-amber-900">
                {errors.slice(0, 8).map((issue) => (
                  <li key={`${issue.sourceSheet}-${issue.sourceRow}-${issue.field}`}>
                    <strong>
                      {issue.sourceSheet}:{issue.sourceRow}
                    </strong>{' '}
                    · {issue.field}
                    {issue.value ? ` «${issue.value}»` : ''} — {issue.message}
                  </li>
                ))}
              </ul>
              {errors.length > 8 ? (
                <p className="mt-2 text-xs text-amber-800">
                  Qolgan {errors.length - 8} tasi CSV faylda.
                </p>
              ) : null}
            </div>
          ) : null}
          {notes.length > 0 ? (
            <p className="mt-4 text-xs text-muted">
              {notes.length} ta yozuvda mas’ul xodim topilmadi — ular baribir import qilinadi va
              Excel’dagi ism izohda saqlanadi.
            </p>
          ) : null}
        </Card>
      ) : null}

      {summary ? (
        <Card title="3-qadam · Natija">
          <div className="grid gap-4 sm:grid-cols-3">
            <KpiTile
              label="Import qilindi"
              value={String(summary.imported)}
              tone="text-success"
            />
            <KpiTile label="Takroriy — o‘tkazib yuborildi" value={String(summary.skipped)} />
            <KpiTile label="Jami summa" value={formatMoney(summary.totalUzs, true)} />
          </div>
          {summary.rejected.length > 0 ? (
            <Alert title={`${summary.rejected.length} ta yozuv qabul qilinmadi`} tone="warning" className="mt-5">
              <ul className="space-y-1">
                {summary.rejected.slice(0, 8).map((item) => (
                  <li key={`${item.sourceSheet}-${item.sourceRow}`}>
                    <strong>
                      {item.sourceSheet}:{item.sourceRow}
                    </strong>{' '}
                    — {item.message}
                  </li>
                ))}
              </ul>
            </Alert>
          ) : (
            <Alert title="Barcha yozuvlar qabul qilindi" tone="success" className="mt-5">
              Xarajatlar jurnali va hisobotlar yangilandi.
            </Alert>
          )}
        </Card>
      ) : null}

      {!preview && !summary && referencesReady && !parsing ? (
        <EmptyState
          title="Fayl tanlanmagan"
          description="Yuqoridan .xlsx faylni tanlang — avval ko‘rib chiqish ko‘rsatiladi."
        />
      ) : null}
    </div>
  );
}
