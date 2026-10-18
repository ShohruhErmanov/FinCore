import type { InvestorPaymentRow, InvestorRef, Settlement } from '@/shared/types/domain';
import { branches, periods } from '../fixtures';
import { MONTH_NAMES_UZ } from '@/shared/lib/format';
import { db, periodRows } from '../state';

// --------------------------------------------------------------- investors
//
// Entitlement is a RECORDED figure per month, mirroring the backend. The mock
// deliberately does not derive it from revenue, because the backend does not.
const INVESTOR_A = '44444444-0000-0000-0000-000000000001';

const INVESTOR_B = '44444444-0000-0000-0000-000000000002';

export const investorProfiles: InvestorRef[] = [
  {
    id: INVESTOR_A,
    userId: db.userRows[0]?.id ?? '',
    fullName: db.userRows[0]?.fullName ?? 'Ali Valiyev',
    phone: db.userRows[0]?.phone ?? '+998901112233',
    ownershipPercent: 2,
    branch: null,
    isActive: true,
  },
  {
    id: INVESTOR_B,
    userId: db.userRows[1]?.id ?? '',
    fullName: db.userRows[1]?.fullName ?? 'Vali Aliyev',
    phone: db.userRows[1]?.phone ?? '+998907778899',
    ownershipPercent: 5,
    branch: branches[1]
      ? { id: branches[1].id, code: branches[1].code, name: branches[1].name }
      : null,
    isActive: true,
  },
];

/** investorId -> "YYYY-MM" -> entitled so‘m. */
export const investorEntitlementRows: Record<string, Record<string, string>> = {
  [INVESTOR_A]: { '2026-08': '10000000', '2026-07': '5000000' },
  [INVESTOR_B]: { '2026-08': '4000000' },
};

type MockInvestorPayment = InvestorPaymentRow & { investorId: string };

export const investorPaymentRows: MockInvestorPayment[] = [
  {
    investorId: INVESTOR_A,
    id: '44444444-0000-0000-0000-0000000000f1',
    paidOn: '2026-08-20',
    amountUzs: '8000000',
    status: 'posted',
    note: 'Avgust ulushi',
    reversalReason: null,
    createdAt: '2026-08-20T10:00:00.000Z',
  },
  {
    investorId: INVESTOR_A,
    id: '44444444-0000-0000-0000-0000000000f2',
    paidOn: '2026-07-18',
    amountUzs: '5000000',
    status: 'posted',
    note: 'Iyul ulushi',
    reversalReason: null,
    createdAt: '2026-07-18T10:00:00.000Z',
  },
];

// --- profit share ---------------------------------------------------------
//
// Unlike entitlement above, the share IS derived: actual revenue times the
// ownership percentage, exactly as fincore.v_investor_period_share does it.
// August carries the worked example — 302 841 471 so‘m — so the mock and the
// real database answer the same 6 056 829,42 for a 2% stake.
const mockFactRevenue: Record<string, string> = {
  '2026-08': '302841471',
  '2026-09': '11000000',
};

/** Half-up to two decimals in bigint hundredths — never a float. */
function mockShare(factUzs: string, ownershipPercent: number): string {
  const percentHundredths = BigInt(Math.round(ownershipPercent * 100));
  const numerator = BigInt(factUzs) * percentHundredths;
  const quotient = numerator / 100n;
  const hundredths = numerator % 100n >= 50n ? quotient + 1n : quotient;
  return `${hundredths / 100n}.${String(hundredths % 100n).padStart(2, '0')}`;
}

function toHundredths(decimal: string): bigint {
  const [whole = '0', fraction = ''] = decimal.split('.');
  return BigInt(whole) * 100n + BigInt(`${fraction}00`.slice(0, 2));
}

function fromHundredths(value: bigint): string {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  return `${negative ? '-' : ''}${magnitude / 100n}.${String(magnitude % 100n).padStart(2, '0')}`;
}

export interface MockPayoutRequest {
  id: string;
  investorId: string;
  investorName: string;
  periodId: string;
  year: number;
  month: number;
  monthLabel: string;
  requestedAmountUzs: string;
  calculatedShareUzs: string;
  factRevenueUzs: string;
  ownershipPercent: number;
  status: 'pending' | 'approved' | 'rejected' | 'paid' | 'cancelled';
  investorNote: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
  paidOn: string | null;
  createdAt: string;
}

export const payoutRequestRows: MockPayoutRequest[] = [];

export function payoutMonths(investorId: string, year: number) {
  const profile = investorProfiles.find((row) => row.id === investorId);
  const percent = profile?.ownershipPercent ?? 0;
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const periodId =
      periodRows.find((period) => period.year === year && period.month === month)?.id ?? key;
    const fact = mockFactRevenue[key] ?? '0';
    const share = toHundredths(mockShare(fact, percent));

    const paid = investorPaymentRows
      .filter(
        (row) =>
          row.investorId === investorId && row.status === 'posted' && row.paidOn.startsWith(key),
      )
      .reduce((acc, row) => acc + BigInt(row.amountUzs) * 100n, 0n);
    const open = payoutRequestRows
      .filter(
        (row) =>
          row.investorId === investorId &&
          row.periodId === periodId &&
          (row.status === 'pending' || row.status === 'approved'),
      )
      .reduce((acc, row) => acc + BigInt(row.requestedAmountUzs) * 100n, 0n);

    const remaining = share - paid - open;
    const payable = remaining <= 0n ? 0n : remaining / 100n;
    return {
      month,
      label: MONTH_NAMES_UZ[index] ?? String(month),
      periodId,
      factRevenueUzs: fact,
      ownershipPercent: percent,
      shareUzs: fromHundredths(share),
      paidUzs: fromHundredths(paid),
      openUzs: fromHundredths(open),
      remainingUzs: fromHundredths(remaining),
      payableUzs: String(payable),
      isSettled: payable === 0n,
      requests: payoutRequestRows.filter(
        (row) => row.investorId === investorId && row.periodId === periodId,
      ),
    };
  });
}

export function payoutSummary(investorId: string, year: number) {
  const profile = investorProfiles.find((row) => row.id === investorId)!;
  const months = payoutMonths(investorId, year);
  const total = (pick: (row: (typeof months)[number]) => string) =>
    months.reduce((acc, row) => acc + toHundredths(pick(row)), 0n);

  const share = total((row) => row.shareUzs);
  const paid = total((row) => row.paidUzs);
  const open = total((row) => row.openUzs);
  const remaining = share - paid - open;
  const payable = remaining <= 0n ? 0n : remaining / 100n;

  return {
    investor: profile,
    year,
    annual: {
      factRevenueUzs: String(months.reduce((acc, row) => acc + BigInt(row.factRevenueUzs), 0n)),
      shareUzs: fromHundredths(share),
      paidUzs: fromHundredths(paid),
      openUzs: fromHundredths(open),
      remainingUzs: fromHundredths(remaining),
      payableUzs: String(payable),
      isSettled: payable === 0n,
    },
    months,
  };
}

/** The single place the mock computes a settlement, so every endpoint agrees. */
function settleMock(entitled: bigint, paid: bigint): Settlement {
  const remaining = entitled > paid ? entitled - paid : 0n;
  const overpaid = paid > entitled ? paid - entitled : 0n;
  const pct = (part: bigint) =>
    entitled === 0n ? 0 : Math.round(Number((part * 10000n) / entitled)) / 100;
  const paidPercent = pct(paid);
  const status: Settlement['status'] =
    entitled === 0n
      ? paid > 0n
        ? 'overpaid'
        : 'no_entitlement'
      : overpaid > 0n
        ? 'overpaid'
        : paid === 0n
          ? 'unpaid'
          : remaining === 0n
            ? 'settled'
            : 'partially_paid';
  return {
    entitledAmountUzs: entitled.toString(),
    paidAmountUzs: paid.toString(),
    remainingAmountUzs: remaining.toString(),
    overpaidAmountUzs: overpaid.toString(),
    paidPercent,
    remainingPercent: pct(remaining),
    settledPercent: Math.min(paidPercent, 100),
    status,
  };
}

export function monthlySettlements(investorId: string, year: number) {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const entitled = BigInt(investorEntitlementRows[investorId]?.[key] ?? '0');
    const paid = investorPaymentRows
      .filter(
        (row) =>
          row.investorId === investorId && row.status === 'posted' && row.paidOn.startsWith(key),
      )
      .reduce((acc, row) => acc + BigInt(row.amountUzs), 0n);
    return {
      month,
      label: MONTH_NAMES_UZ[index] ?? String(month),
      periodId:
        periods.find((period) => period.year === year && period.month === month)?.id ?? null,
      settlement: settleMock(entitled, paid),
      paymentCount: 0,
    };
  });
}

/** The year is the sum of its months — never a separately stored total. */
export function annualSettlement(investorId: string, year: number): Settlement {
  const months = monthlySettlements(investorId, year);
  const entitled = months.reduce((acc, row) => acc + BigInt(row.settlement.entitledAmountUzs), 0n);
  const paid = months.reduce((acc, row) => acc + BigInt(row.settlement.paidAmountUzs), 0n);
  return settleMock(entitled, paid);
}
