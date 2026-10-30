/**
 * Preview math for the Repair Estimate, Invoice and Coverage Determination Letter forms — the same integer-cent
 * formulas as backend/utils/{estimate,invoice,coverageLetter}Calculations.js. Display only: the server recomputes
 * every figure and ignores client totals. No figure is ever produced by Super Intelligence.
 */
const toCents = (amount: number) => Math.round(amount * 100);
const pct = (cents: number, percent: number) => Math.round(cents * ((Number(percent) || 0) / 100));
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v)) || 0;

export interface EstimateLine {
  code: string;
  description: string;
  qty: number | string;
  unit: string;
  unitPrice: number | string;
  taxable?: boolean;
}

export interface DepreciationRow {
  item: string;
  condition: string;
  ageYears: number | string;
  lifeExpectancyYears: number | string;
  depreciationPercent: number | string;
  relatedLineItemCodes: string[];
}

export const lineTotalCents = (l: EstimateLine) => toCents(num(l.qty) * num(l.unitPrice));

export function estimateTotals(lines: EstimateLine[], overheadProfitPercent: number | string, taxRatePercent: number | string) {
  const subtotal = lines.reduce((t, l) => t + lineTotalCents(l), 0);
  const overheadProfit = pct(subtotal, num(overheadProfitPercent));
  const taxableAmount = lines.filter((l) => l.taxable !== false).reduce((t, l) => t + lineTotalCents(l), 0);
  const tax = pct(taxableAmount, num(taxRatePercent));
  return { subtotal: subtotal / 100, overheadProfit: overheadProfit / 100, taxableAmount: taxableAmount / 100, tax: tax / 100, grandTotal: (subtotal + overheadProfit + tax) / 100 };
}

export function depreciationRow(row: DepreciationRow, lines: EstimateLine[]) {
  const codes = new Set(row.relatedLineItemCodes);
  const rcv = lines.filter((l) => codes.has(l.code)).reduce((t, l) => t + lineTotalCents(l), 0);
  const depreciation = pct(rcv, num(row.depreciationPercent));
  return { rcv: rcv / 100, depreciationAmount: depreciation / 100, acv: (rcv - depreciation) / 100 };
}

export interface Payment {
  date: string;
  description: string;
  method: string;
  amount: number | string;
}

/** Invoice: services are the estimate's frozen line items; O&P comes from the estimate; payments reduce the balance;
 * change orders are informational only. */
export function invoiceTotals(services: EstimateLine[], overheadProfitPercent: number, taxRatePercent: number | string, payments: Payment[]) {
  const servicesSubtotal = services.reduce((t, l) => t + lineTotalCents(l), 0);
  const overheadProfit = pct(servicesSubtotal, overheadProfitPercent);
  const combinedSubtotal = servicesSubtotal + overheadProfit;
  const taxable = services.filter((l) => l.taxable !== false).reduce((t, l) => t + lineTotalCents(l), 0);
  const tax = pct(taxable, num(taxRatePercent));
  const paid = payments.reduce((t, p) => t + toCents(num(p.amount)), 0);
  return {
    servicesSubtotal: servicesSubtotal / 100,
    overheadProfit: overheadProfit / 100,
    combinedSubtotal: combinedSubtotal / 100,
    tax: tax / 100,
    paymentsReceivedTotal: paid / 100,
    balanceDue: (combinedSubtotal + tax - paid) / 100,
  };
}

export type Determination = 'approved' | 'denied' | 'pending';

export interface DeterminationRow {
  item: string;
  determination: Determination;
  policyBasis: string;
  relatedLineItemCodes: string[];
  pendingNote?: string;
}

/** Coverage letter: approved RCV from approved items' codes; depreciation withheld only for rows whose codes are ALL
 * approved; initial payment = approved RCV − deductible − withheld depreciation. */
export function coverageTotals(lines: EstimateLine[], depreciation: DepreciationRow[], items: DeterminationRow[], deductible: number | string) {
  const approvedCodes = new Set(items.filter((i) => i.determination === 'approved').flatMap((i) => i.relatedLineItemCodes));
  const approvedRCV = lines.filter((l) => approvedCodes.has(l.code)).reduce((t, l) => t + lineTotalCents(l), 0);
  const withheld = depreciation
    .filter((r) => r.relatedLineItemCodes.length > 0 && r.relatedLineItemCodes.every((c) => approvedCodes.has(c)))
    .reduce((t, r) => t + toCents(depreciationRow(r, lines).depreciationAmount), 0);
  const ded = toCents(num(deductible));
  return {
    approvedRCV: approvedRCV / 100,
    deductible: ded / 100,
    recoverableDepreciationWithheld: withheld / 100,
    initialPayment: (approvedRCV - ded - withheld) / 100,
    approvedCount: items.filter((i) => i.determination === 'approved').length,
    deniedCount: items.filter((i) => i.determination === 'denied').length,
    pendingCount: items.filter((i) => i.determination === 'pending').length,
  };
}

export function money(amount: number | null | undefined, currency = 'USD'): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
