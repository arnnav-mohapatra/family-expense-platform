export type BalanceMap = ReadonlyMap<string, bigint>;

/**
 * Deterministically simplify balances using a greedy creditor/debtor matcher.
 * Positive values are amounts owed to the member; negative values are amounts owed by them.
 */
export function simplifyDebts(balances: BalanceMap): Array<{ from: string; to: string; amountMinor: bigint }> {
  const debtors = [...balances].filter(([, amount]) => amount < 0).map(([id, amount]) => ({ id, amount: -amount }));
  const creditors = [...balances].filter(([, amount]) => amount > 0).map(([id, amount]) => ({ id, amount }));
  debtors.sort(([a], [b]) => a.localeCompare(b));
  creditors.sort(([a], [b]) => a.localeCompare(b));

  const result: Array<{ from: string; to: string; amountMinor: bigint }> = [];
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const debtor = debtors[d]!;
    const creditor = creditors[c]!;
    const amountMinor = debtor.amount < creditor.amount ? debtor.amount : creditor.amount;
    if (amountMinor > 0n) result.push({ from: debtor.id, to: creditor.id, amountMinor });
    debtor.amount -= amountMinor;
    creditor.amount -= amountMinor;
    if (debtor.amount === 0n) d++;
    if (creditor.amount === 0n) c++;
  }
  return result;
}
