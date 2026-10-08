import { calculateBalances, simplifyDebts, validateBalancedExpense } from "./index";

export type LedgerDirection = "DEBIT" | "CREDIT";

export type LedgerLine = {
  accountUserId: string;
  counterpartyUserId: string;
  amountMinor: bigint;
  currency: string;
  direction: LedgerDirection;
  sourceId: string;
};

export function buildExpenseLedgerLines(
  expenseId: string,
  groupCurrency: string,
  payers: readonly { userId: string; groupAmountMinor: bigint }[],
  splits: readonly { userId: string; groupAmountMinor: bigint }[],
): LedgerLine[] {
  const total = payers.reduce((s, p) => s + p.groupAmountMinor, 0n);
  validateBalancedExpense(
    total,
    payers.map(p => p.groupAmountMinor),
    splits.map(s => s.groupAmountMinor),
  );

  const balances = calculateBalances(
    payers.map(p => ({ userId: p.userId, amountMinor: p.groupAmountMinor })),
    splits.map(s => ({ userId: s.userId, amountMinor: s.groupAmountMinor })),
  );

  return simplifyDebts(balances).flatMap(tx => [
    {
      accountUserId: tx.from,
      counterpartyUserId: tx.to,
      amountMinor: tx.amountMinor,
      currency: groupCurrency,
      direction: "DEBIT" as const,
      sourceId: expenseId,
    },
    {
      accountUserId: tx.to,
      counterpartyUserId: tx.from,
      amountMinor: tx.amountMinor,
      currency: groupCurrency,
      direction: "CREDIT" as const,
      sourceId: expenseId,
    },
  ]);
}
