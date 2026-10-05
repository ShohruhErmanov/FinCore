/**
 * Turns an audit action code into a sentence a director can read.
 *
 * The codes come from two places. The generic database trigger writes
 * `<table>.create|update|delete` for every audited table; a handful of events
 * are written by hand with their own codes (`users.salary.update`,
 * `accounting_year.create`, …). The API deliberately returns no payloads, so
 * the code is all there is to go on — which is enough to say what happened.
 *
 * A code this table does not know yet (a newly audited table) still gets a
 * readable verb, and its raw code stays on screen so nothing is hidden.
 */

export type AuditActionKind = 'create' | 'update' | 'delete' | 'security' | 'other';

export interface AuditActionDescription {
  label: string;
  kind: AuditActionKind;
}

/** Events with codes of their own, written outside the generic trigger. */
const SPECIAL: Record<string, AuditActionDescription> = {
  'users.create': { label: 'Foydalanuvchi yaratildi', kind: 'create' },
  'users.delete': { label: 'Foydalanuvchi o‘chirildi', kind: 'delete' },
  'users.salary.update': { label: 'Foydalanuvchining fix oyligi o‘zgartirildi', kind: 'update' },
  'users.password_reset': {
    label: 'Foydalanuvchi paroli almashtirildi',
    kind: 'security',
  },
  'users.password_change': {
    label: 'Foydalanuvchi o‘z parolini o‘zgartirdi',
    kind: 'security',
  },
  'accounting_year.create': { label: 'Yangi hisob yili ochildi', kind: 'create' },
};

/** Per audited table: what was created, changed or removed. */
const TABLES: Record<string, Partial<Record<'create' | 'update' | 'delete', string>>> = {
  revenue_transactions: {
    create: 'Kunlik tushum kiritildi',
    update: 'Kunlik tushum tahrirlandi',
    delete: 'Kunlik tushum o‘chirildi',
  },
  expenses: {
    create: 'Xarajat kiritildi',
    update: 'Xarajat tahrirlandi',
    delete: 'Xarajat o‘chirildi',
  },
  budget_lines: {
    create: 'Budjet qatori qo‘shildi',
    update: 'Budjet qatori o‘zgartirildi',
    delete: 'Budjet qatori o‘chirildi',
  },
  investor_profiles: {
    create: 'Investor profili yaratildi',
    update: 'Investor profili o‘zgartirildi',
  },
  investor_capital_contributions: {
    create: 'Investor kiritgan kapital qayd etildi',
  },
  investor_entitlements: {
    create: 'Investorga tegishli summa kiritildi',
    update: 'Investorga tegishli summa o‘zgartirildi',
  },
  investor_payments: {
    create: 'Investorga to‘lov qayd etildi',
    update: 'Investorga to‘lov o‘zgartirildi',
  },
  investor_payout_requests: {
    create: 'Investor to‘lov so‘rovi yuborildi',
    // Approve, reject, pay and cancel all land here; the code alone cannot
    // tell them apart, so the label says only what is certain.
    update: 'Investor to‘lov so‘rovi holati o‘zgardi',
  },
};

const VERBS: Record<'create' | 'update' | 'delete', string> = {
  create: 'yaratildi',
  update: 'o‘zgartirildi',
  delete: 'o‘chirildi',
};

export function describeAuditAction(code: string): AuditActionDescription {
  const special = SPECIAL[code];
  if (special) return special;

  const dot = code.lastIndexOf('.');
  const table = dot > 0 ? code.slice(0, dot) : code;
  const operation = dot > 0 ? code.slice(dot + 1) : '';
  if (operation !== 'create' && operation !== 'update' && operation !== 'delete')
    return { label: code, kind: 'other' };

  const known = TABLES[table]?.[operation];
  if (known) return { label: known, kind: operation };
  // An audited table added after this list: still a readable verb.
  return { label: `${table.replace(/_/g, ' ')} yozuvi ${VERBS[operation]}`, kind: operation };
}
