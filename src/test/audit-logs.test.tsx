import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { describeAuditAction } from '@/features/audit/audit-actions';
import { AuditLogsPage } from '@/features/audit/audit-logs-page';
import { auditApi } from '@/shared/api/contracts';
import type { AuditLogRow } from '@/shared/types/domain';

vi.mock('@/shared/api/contracts', () => ({ auditApi: { list: vi.fn() } }));

describe('describeAuditAction', () => {
  // Every code present in the live audit_logs table, plus the password events.
  it.each([
    ['revenue_transactions.create', 'Kunlik tushum kiritildi', 'create'],
    ['revenue_transactions.update', 'Kunlik tushum tahrirlandi', 'update'],
    ['expenses.create', 'Xarajat kiritildi', 'create'],
    ['expenses.update', 'Xarajat tahrirlandi', 'update'],
    ['budget_lines.create', 'Budjet qatori qo‘shildi', 'create'],
    ['budget_lines.update', 'Budjet qatori o‘zgartirildi', 'update'],
    ['investor_profiles.create', 'Investor profili yaratildi', 'create'],
    ['investor_capital_contributions.create', 'Investor kiritgan kapital qayd etildi', 'create'],
    ['investor_entitlements.create', 'Investorga tegishli summa kiritildi', 'create'],
    ['investor_payments.create', 'Investorga to‘lov qayd etildi', 'create'],
    ['investor_payout_requests.create', 'Investor to‘lov so‘rovi yuborildi', 'create'],
    ['investor_payout_requests.update', 'Investor to‘lov so‘rovi holati o‘zgardi', 'update'],
    ['users.create', 'Foydalanuvchi yaratildi', 'create'],
    ['users.delete', 'Foydalanuvchi o‘chirildi', 'delete'],
    ['users.salary.update', 'Foydalanuvchining fix oyligi o‘zgartirildi', 'update'],
    ['users.password_reset', 'Foydalanuvchi paroli almashtirildi', 'security'],
    ['users.password_change', 'Foydalanuvchi o‘z parolini o‘zgartirdi', 'security'],
    ['accounting_year.create', 'Yangi hisob yili ochildi', 'create'],
  ])('%s → %s', (code, label, kind) => {
    expect(describeAuditAction(code)).toEqual({ label, kind });
  });

  it('still reads a table audited after this list was written', () => {
    expect(describeAuditAction('revenue_plans.update')).toEqual({
      label: 'revenue plans yozuvi o‘zgartirildi',
      kind: 'update',
    });
  });

  it('shows an unrecognised code as it is rather than guessing', () => {
    expect(describeAuditAction('period.close')).toEqual({ label: 'period.close', kind: 'other' });
  });
});

describe('Audit jurnali page', () => {
  const row = (action: string): AuditLogRow => ({
    id: action,
    actorName: 'Ergashev Abdulla',
    action,
    entityType: action.split('.')[0]!,
    entityId: '9ce2ffda-0000-4000-8000-000000000001',
    result: 'success',
    branchName: null,
    occurredAt: '2026-10-01T22:16:00+05:00',
  });

  it('reads each action as a sentence and keeps the code under it for searching', async () => {
    vi.mocked(auditApi.list).mockResolvedValue({
      data: [row('investor_capital_contributions.create'), row('period.close')],
      meta: { page: 1, pageSize: 100, total: 2, totalPages: 1 },
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuditLogsPage />
      </QueryClientProvider>,
    );

    const table = await screen.findByRole('table');
    const capital = within(table).getByText('Investor kiritgan kapital qayd etildi');
    expect(capital).toBeInTheDocument();
    expect(
      within(capital.closest('td')!).getByText('investor_capital_contributions.create'),
    ).toBeInTheDocument();
    // An unknown code is shown once, not twice.
    expect(within(table).getAllByText('period.close')).toHaveLength(1);
  });
});
