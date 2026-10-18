import { MessageSquareText } from 'lucide-react';
import { memo, useState } from 'react';
import { formatMoney, formatPercent } from '@/shared/lib/format';
import type { BudgetLine } from '@/shared/types/domain';
import { MoneyText, Textarea, VarianceText } from '@/shared/ui';
import { type BudgetLineDraft, getLinePresentation, MAX_BUDGET_AMOUNT } from './budget-plan';

const BudgetBranchEditor = memo(function BudgetBranchEditor({
  line,
  draft,
  editable,
  onChange,
}: {
  line: BudgetLine;
  draft: BudgetLineDraft;
  editable: boolean;
  onChange: (next: BudgetLineDraft) => void;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [amountError, setAmountError] = useState('');
  const previewPlan = draft.hasPlan ? (draft.plannedAmountUzs ?? '0') : null;
  const previewVariance =
    previewPlan === null
      ? null
      : (BigInt(previewPlan || '0') - BigInt(line.actualAmountUzs)).toString();
  const presentation = getLinePresentation({
    hasPlan: draft.hasPlan,
    plannedAmountUzs: previewPlan,
    actualAmountUzs: line.actualAmountUzs,
    varianceUzs: previewVariance,
  });

  return (
    <div className="budget-branch-editor">
      <div className="budget-branch-heading">
        <span className="budget-branch-name">{line.branchName}</span>
        {editable ? (
          <div
            role="group"
            aria-label={`${line.branchName}, ${line.categoryNameSnapshot} reja mavjudligi`}
            className="budget-plan-switch"
          >
            <button
              type="button"
              aria-pressed={!draft.hasPlan}
              onClick={() => onChange({ ...draft, hasPlan: false, plannedAmountUzs: null })}
            >
              Reja yo‘q
            </button>
            <button
              type="button"
              aria-pressed={draft.hasPlan}
              onClick={() =>
                onChange({
                  ...draft,
                  hasPlan: true,
                  plannedAmountUzs: draft.plannedAmountUzs ?? '0',
                })
              }
            >
              Reja mavjud
            </button>
          </div>
        ) : (
          <span className="text-xs text-muted">{draft.hasPlan ? 'Reja mavjud' : 'Reja yo‘q'}</span>
        )}
      </div>
      {draft.hasPlan ? (
        <div className="budget-branch-fields">
          <div className="min-w-0">
            {/* The input carries its own aria-label; this stays for the click target. */}
            <label className="sr-only" htmlFor={`budget-amount-${line.id}`}>
              Reja summasi
            </label>
            {editable ? (
              <div className="budget-amount-wrap">
                <input
                  id={`budget-amount-${line.id}`}
                  data-budget-amount
                  aria-label={`${line.branchName}, ${line.categoryNameSnapshot} reja summasi`}
                  inputMode="numeric"
                  autoComplete="off"
                  aria-invalid={Boolean(amountError)}
                  aria-describedby={amountError ? `budget-error-${line.id}` : undefined}
                  value={formatMoney(previewPlan).replace(/ so‘m$/, '')}
                  onChange={(event) => {
                    const raw = event.target.value.replace(/[\s\u00a0]/g, '');
                    if (!/^\d*$/.test(raw)) {
                      setAmountError('Faqat musbat butun summa kiriting.');
                      return;
                    }
                    if (BigInt(raw || '0') > MAX_BUDGET_AMOUNT) {
                      setAmountError('Summa ruxsat etilgan chegaradan oshdi.');
                      return;
                    }
                    setAmountError('');
                    onChange({ ...draft, plannedAmountUzs: BigInt(raw || '0').toString() });
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    const inputs = [
                      ...document.querySelectorAll<HTMLInputElement>('[data-budget-amount]'),
                    ];
                    const next = inputs[inputs.indexOf(event.currentTarget) + 1];
                    if (next) {
                      event.preventDefault();
                      next.focus();
                      next.select();
                    }
                  }}
                />
                <span>so‘m</span>
              </div>
            ) : (
              <MoneyText value={previewPlan} className="font-semibold text-ink" />
            )}
            {amountError ? (
              <p id={`budget-error-${line.id}`} role="alert" className="mt-1 text-xs text-danger">
                {amountError}
              </p>
            ) : null}
            {previewPlan === '0' ? (
              <p className="mt-0.5 text-[11px] text-info">0 so‘m — haqiqiy nol reja</p>
            ) : null}
          </div>
          {editable ? (
            <button
              type="button"
              className="budget-note-button"
              aria-expanded={noteOpen}
              aria-label={draft.reason ? 'Izohni tahrirlash' : 'Izoh qo‘shish'}
              title={draft.reason ? 'Izohni tahrirlash' : 'Izoh qo‘shish'}
              data-has-note={draft.reason ? 'true' : undefined}
              onClick={() => setNoteOpen((open) => !open)}
            >
              <MessageSquareText className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
          {draft.reason && !noteOpen ? (
            <p className="budget-note-preview" title={draft.reason}>
              {draft.reason}
            </p>
          ) : null}
          {editable && noteOpen ? (
            <Textarea
              aria-label={`${line.branchName}, ${line.categoryNameSnapshot} izoh yoki sabab`}
              value={draft.reason ?? ''}
              maxLength={1000}
              className="budget-note-input min-h-16"
              placeholder="Izoh yoki reja sababi"
              onChange={(event) => onChange({ ...draft, reason: event.target.value || null })}
            />
          ) : null}
        </div>
      ) : (
        <p className="budget-no-plan">Reja kiritilmagan</p>
      )}
      <div className="budget-branch-meta">
        <span>
          Fakt: <MoneyText value={line.actualAmountUzs} />
        </span>
        <span>
          Farq: {previewVariance === null ? '—' : <VarianceText value={previewVariance} />}
        </span>
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${presentation.className}`}
        >
          {presentation.label}
        </span>
        {presentation.completion !== null ? (
          <span>Bajarilish: {formatPercent(presentation.completion)}</span>
        ) : null}
      </div>
    </div>
  );
});

export function SelectedBudgetCategory({
  categoryLines,
  drafts,
  editable,
  onChangeLine,
}: {
  categoryLines: BudgetLine[];
  drafts: Record<string, BudgetLineDraft>;
  editable: boolean;
  onChangeLine: (next: BudgetLineDraft) => void;
}) {
  const first = categoryLines[0]!;
  const categoryTotal = categoryLines.reduce((sum, line) => {
    const draft = drafts[line.id] ?? line;
    return sum + (draft.hasPlan ? BigInt(draft.plannedAmountUzs ?? '0') : 0n);
  }, 0n);

  return (
    <article className="budget-category-card" key={first.categoryId}>
      <div className="budget-category-heading">
        <h3>{first.categoryNameSnapshot}</h3>
        <div className="budget-category-side">
          <span className="budget-type-badge">
            {first.expenseTypeSnapshot === 'fixed' ? 'Doimiy' : 'O‘zgaruvchan'}
          </span>
          <span className="budget-category-total">
            <span>Jami</span>
            <strong>{formatMoney(categoryTotal.toString())}</strong>
          </span>
        </div>
      </div>
      <div className="budget-category-branches">
        {categoryLines.map((line) => (
          <BudgetBranchEditor
            key={line.id}
            line={line}
            draft={drafts[line.id] ?? line}
            editable={editable}
            onChange={onChangeLine}
          />
        ))}
      </div>
    </article>
  );
}
