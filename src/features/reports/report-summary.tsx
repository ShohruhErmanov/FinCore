import { cn } from '@/shared/lib/cn';
import { formatPercent } from '@/shared/lib/format';
import type { PlanActual } from '@/shared/types/domain';
import { Card, MoneyText, PercentText, VarianceText } from '@/shared/ui';
import { insightToneClass, type ReportInsight, reportStatusMeta } from './report-insights';

/** Excel hisobotidagi kabi bajarilish foizini doimo ikki kasr bilan ko‘rsatadi. */
function FixedReportPercent({ value }: { value: number | null }) {
  const formatted = formatPercent(value, 2);
  if (formatted === '—') return <span className="tabular-nums">—</span>;
  const number = formatted.slice(0, -1);
  const separator = number.lastIndexOf(',');
  const fractionLength = separator === -1 ? 0 : number.length - separator - 1;
  const padded =
    separator === -1 ? `${number},00` : `${number}${'0'.repeat(Math.max(0, 2 - fractionLength))}`;
  return <span className="tabular-nums">{padded}%</span>;
}

export function PlanActualSummary({
  title,
  data,
  helper,
  fixedCompletion = false,
}: {
  title: string;
  data: PlanActual;
  helper?: string;
  fixedCompletion?: boolean;
}) {
  const meta = reportStatusMeta(data.status);
  return (
    <div className="neu-raised rounded-card p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-slate-600">{title}</p>
        <span className={cn('rounded-full px-2 py-1 text-[11px] font-semibold', meta.className)}>
          {meta.label}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted">Reja</dt>
          <dd className="mt-1 font-bold text-ink">
            <MoneyText value={data.plannedAmountUzs} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Fakt</dt>
          <dd className="mt-1 font-bold text-ink">
            <MoneyText value={data.actualAmountUzs} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Farq</dt>
          <dd className="mt-1">
            {data.varianceUzs === null ? (
              <span className="text-muted">—</span>
            ) : (
              <VarianceText value={data.varianceUzs} />
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Bajarilish</dt>
          <dd className="mt-1 font-bold text-ink">
            {fixedCompletion ? (
              <FixedReportPercent value={data.completionPercent} />
            ) : (
              <PercentText value={data.completionPercent} />
            )}
          </dd>
        </div>
      </dl>
      {helper ? <p className="mt-3 text-xs leading-5 text-muted">{helper}</p> : null}
    </div>
  );
}

export function InsightList({
  title,
  description,
  insights,
}: {
  title: string;
  description: string;
  insights: ReportInsight[];
}) {
  const visible = [...insights].sort((a, b) => b.priority - a.priority).slice(0, 8);
  return (
    <Card title={title} description={description}>
      {visible.length ? (
        <div className="space-y-3">
          {visible.map((insight) => (
            <div
              key={insight.key}
              className={cn(
                'rounded-xl border p-4 shadow-[var(--neu-shadow-1)]',
                insightToneClass[insight.tone],
              )}
            >
              <p className="font-semibold leading-6 text-ink">{insight.text}</p>
              <p className="mt-1 text-xs text-muted">{insight.detail}</p>
            </div>
          ))}
          {insights.length > visible.length ? (
            <p className="text-xs text-muted">
              Yana {insights.length - visible.length} ta natija CSV eksportida saqlangan.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted">
          Tanlangan kontekstda tahlil qilinadigan xarajat topilmadi.
        </p>
      )}
    </Card>
  );
}
