import { useQuery } from '@tanstack/react-query';
import { Download, UserRound } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { getApiErrorMessage } from '@/shared/api/client';
import { referenceApi, reportApi } from '@/shared/api/contracts';
import { queryKeys } from '@/shared/api/query-keys';
import { downloadCsv } from '@/shared/lib/csv';
import { formatMoney, formatPercent } from '@/shared/lib/format';
import type { CashierReport } from './cashier-report';
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormField,
  LoadingState,
  MoneyText,
  PageHeader,
  PercentText,
  Select,
  VarianceText,
} from '@/shared/ui';

function exportCashierReport(report: CashierReport) {
  downloadCsv(`kassirlar-${report.periodLabel.replace(/\s+/g, '-').toLowerCase()}`, [
    [
      'Filial',
      'Kassir',
      'Holat',
      'Fix oylik',
      'Reja (ulush)',
      'Yig‘ilgan tushum',
      'Farq',
      'Reja bajarilishi %',
      'Filial ulushi %',
      'Oylik / tushum %',
      'Kiritilgan kun',
    ],
    ...report.branches.flatMap((group) => [
      ...group.cashiers.map((row) => [
        group.branchName,
        row.fullName,
        row.isActive ? 'Faol' : 'Nofaol',
        row.fixedSalaryUzs,
        row.planUzs,
        row.actualUzs,
        row.varianceUzs,
        row.completionPct,
        row.branchSharePct,
        row.salaryToRevenuePct,
        row.daysWithEntry,
      ]),
      [
        group.branchName,
        'JAMI',
        '',
        group.salaryTotalUzs,
        group.planUzs,
        group.actualUzs,
        group.varianceUzs,
        group.completionPct,
        '',
        '',
        '',
      ],
    ]),
    [
      'MARKAZ JAMI',
      '',
      '',
      report.total.salaryTotalUzs,
      report.total.planUzs,
      report.total.actualUzs,
      report.total.varianceUzs,
      report.total.completionPct,
      '',
      report.total.salaryToRevenuePct,
      '',
    ],
  ]);
}

function Tile({ label, value, helper }: { label: string; value: React.ReactNode; helper: string }) {
  return (
    <div className="rounded-card border border-border bg-white p-4 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-xl font-bold text-ink">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted">{helper}</p>
    </div>
  );
}

export function CashierReportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const periods = useQuery({
    queryKey: queryKeys.periods,
    queryFn: ({ signal }) => referenceApi.periods(signal),
    staleTime: 60_000,
  });
  const branches = useQuery({
    queryKey: queryKeys.branches,
    queryFn: ({ signal }) => referenceApi.branches(signal),
    staleTime: 300_000,
  });
  const period =
    searchParams.get('period') ??
    periods.data?.find((item) => item.status === 'open')?.id ??
    periods.data?.[0]?.id ??
    '';
  const branch = searchParams.get('branch') ?? 'all';
  const report = useQuery({
    queryKey: queryKeys.report('cashiers', `period=${period}&branch=${branch}`),
    queryFn: ({ signal }) => reportApi.cashiers({ period, branch }, signal),
    enabled: Boolean(period),
  });

  const ownScope = report.data?.scope === 'own';

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  return (
    <div>
      <Breadcrumbs
        items={[{ label: 'Hisobotlar' }, { label: ownScope ? 'Mening natijam' : 'Kassirlar', current: true }]}
      />
      <PageHeader
        title={ownScope ? 'Mening natijam' : 'Kassirlar hisoboti'}
        description={
          ownScope
            ? 'Bu oyda qancha tushum yig‘dingiz, rejadan qancha kam yoki ko‘p — va fix oyligingiz.'
            : 'Markazlar kesimida: fix oylik, yig‘ilgan tushum va rejadan farq.'
        }
        actions={
          <Button
            variant="secondary"
            disabled={!report.data?.branches.length}
            onClick={() => report.data && exportCashierReport(report.data)}
          >
            <Download className="h-4 w-4" /> CSV yuklab olish
          </Button>
        }
      />

      <Card title="Filtrlar" className="mb-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
          <FormField label="Davr" htmlFor="cashier-period">
            <Select
              id="cashier-period"
              value={period}
              onChange={(event) => setFilter('period', event.target.value)}
            >
              {(periods.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </Select>
          </FormField>
          {!ownScope ? (
            <FormField label="Markaz" htmlFor="cashier-branch">
              <Select
                id="cashier-branch"
                value={branch}
                onChange={(event) => setFilter('branch', event.target.value)}
              >
                <option value="all">Barchasi</option>
                {(branches.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}
        </div>
      </Card>

      {report.isLoading ? <LoadingState label="Kassirlar hisoboti hisoblanmoqda…" /> : null}
      {report.isError ? (
        <ErrorState
          message={getApiErrorMessage(report.error)}
          onRetry={() => void report.refetch()}
        />
      ) : null}
      {report.data ? <CashierReportContent report={report.data} /> : null}
    </div>
  );
}

/** Kassirning o‘z natijasi — bitta qator, katta ko‘rsatkichlar bilan. */
function OwnPerformance({ report }: { report: CashierReport }) {
  const group = report.branches[0];
  const row = group?.cashiers[0];
  if (!group || !row)
    return (
      <EmptyState
        title="Ma’lumot yo‘q"
        description="Bu davrda sizga kassir roli biriktirilmagan."
      />
    );

  const ahead = BigInt(row.varianceUzs) >= 0n;
  return (
    <>
      <Card
        title={`${row.fullName} · ${group.branchName}`}
        description={`${report.periodLabel} bo‘yicha shaxsiy natija`}
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Tile
            label="Men yig‘gan tushum"
            value={<MoneyText value={row.actualUzs} compact />}
            helper={`${row.daysWithEntry} kun tushum kiritilgan`}
          />
          <Tile
            label="Mening rejam"
            value={<MoneyText value={row.planUzs} compact />}
            helper="Markaz rejasidan sizga to‘g‘ri keladigan ulush"
          />
          <Tile
            label={ahead ? 'Rejadan ortiq' : 'Rejaga yetmagan'}
            value={<VarianceText value={row.varianceUzs} />}
            helper={ahead ? 'Rejani bajardingiz' : 'Shuncha summa yetishmayapti'}
          />
          <Tile
            label="Reja bajarilishi"
            value={<PercentText value={row.completionPct} />}
            helper={`Markaz tushumidagi ulushingiz ${formatPercent(row.branchSharePct)}`}
          />
        </div>

        <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${ahead ? 'bg-success' : 'bg-primary'}`}
            style={{ width: `${Math.max(0, Math.min(row.completionPct ?? 0, 100))}%` }}
          />
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Tile
            label="Fix oyligim"
            value={<MoneyText value={row.fixedSalaryUzs} />}
            helper="Oylik maosh — «Foydalanuvchilar» bo‘limida belgilanadi"
          />
          <Tile
            label="Markaz jami tushumi"
            value={<MoneyText value={group.actualUzs} compact />}
            helper={`${group.branchName} bo‘yicha barcha kassirlar`}
          />
        </div>
      </Card>

      <Alert
        title={ahead ? 'Reja bajarildi' : 'Reja hali bajarilmagan'}
        tone={ahead ? 'success' : 'warning'}
        className="mt-5"
      >
        {ahead ? (
          <>
            Siz rejadan <strong>{formatMoney(row.varianceUzs, true)}</strong> ko‘p tushum
            yig‘dingiz.
          </>
        ) : (
          <>
            Rejaga yetish uchun yana{' '}
            <strong>{formatMoney(row.varianceUzs.replace('-', ''), true)}</strong> kerak.
          </>
        )}{' '}
        Reja — markazning oylik tushum rejasi filialdagi faol kassirlar orasida teng bo‘lingani.
      </Alert>
    </>
  );
}

function CashierReportContent({ report }: { report: CashierReport }) {
  if (report.scope === 'own') return <OwnPerformance report={report} />;

  if (report.branches.length === 0)
    return (
      <EmptyState
        title="Kassir topilmadi"
        description="Tanlangan markazda kassir roli biriktirilgan xodim yo‘q."
      />
    );

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Yig‘ilgan tushum"
          value={<MoneyText value={report.total.actualUzs} compact />}
          helper={`Reja ${formatMoney(report.total.planUzs, true)}`}
        />
        <Tile
          label="Rejadan farq"
          value={<VarianceText value={report.total.varianceUzs} />}
          helper={`Bajarilish ${formatPercent(report.total.completionPct)}`}
        />
        <Tile
          label="Fix oyliklar jami"
          value={<MoneyText value={report.total.salaryTotalUzs} compact />}
          helper={`${report.total.activeCashierCount} ta faol kassir`}
        />
        <Tile
          label="Oylik / tushum"
          value={<PercentText value={report.total.salaryToRevenuePct} />}
          helper="Oyliklar yig‘ilgan tushumning necha foizi"
        />
      </div>

      {report.branches.map((group) => (
        <Card
          key={group.branchId}
          title={group.branchName}
          description={`${report.periodLabel} · reja ${formatMoney(group.planUzs, true)}`}
          className="mt-5 overflow-hidden"
          actions={
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
              <UserRound className="h-4 w-4 text-muted" />
              {group.cashiers.length} kassir
            </span>
          }
        >
          <div className="-m-5 overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <caption className="sr-only">{group.branchName} kassirlari</caption>
              <thead>
                <tr className="border-b border-border bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <th className="px-4 py-3 text-left">Kassir</th>
                  <th className="px-4 py-3 text-right">Fix oylik</th>
                  <th className="px-4 py-3 text-right">Reja (ulush)</th>
                  <th className="px-4 py-3 text-right">Yig‘ilgan</th>
                  <th className="px-4 py-3 text-right">Farq</th>
                  <th className="px-4 py-3 text-right">Bajarilish</th>
                  <th className="px-4 py-3 text-right">Filial ulushi</th>
                  <th className="px-4 py-3 text-right">Oylik/tushum</th>
                  <th className="px-4 py-3 text-right">Kun</th>
                </tr>
              </thead>
              <tbody>
                {group.cashiers.map((row) => (
                  <tr key={row.userId} className="border-b border-border last:border-0">
                    <th scope="row" className="px-4 py-3 text-left">
                      <p className="font-semibold text-ink">{row.fullName}</p>
                      {!row.isActive ? (
                        <p className="mt-0.5 text-xs text-muted">Nofaol · tarixiy yozuv</p>
                      ) : null}
                    </th>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <MoneyText value={row.fixedSalaryUzs} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">
                      <MoneyText value={row.planUzs} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-ink">
                      <MoneyText value={row.actualUzs} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <VarianceText value={row.varianceUzs} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                      <PercentText value={row.completionPct} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <PercentText value={row.branchSharePct} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <PercentText value={row.salaryToRevenuePct} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                      {row.daysWithEntry}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-slate-50 font-bold text-ink">
                  <th scope="row" className="px-4 py-3 text-left">
                    JAMI
                  </th>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <MoneyText value={group.salaryTotalUzs} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <MoneyText value={group.planUzs} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <MoneyText value={group.actualUzs} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <VarianceText value={group.varianceUzs} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <PercentText value={group.completionPct} />
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      ))}

      <Alert title="Reja qanday bo‘linadi" tone="info" className="mt-5">
        Kassirning rejasi — <strong>markazning oylik tushum rejasi</strong> shu filialdagi{' '}
        <strong>faol</strong> kassirlar orasida teng bo‘lingani. Nofaol xodimga reja
        berilmaydi, lekin uning tarixiy tushumi hisobotdan yo‘qolmaydi. Fix oylikni
        «Foydalanuvchilar» sahifasida o‘zgartirasiz.
      </Alert>
    </>
  );
}
