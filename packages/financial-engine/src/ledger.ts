import { validateBalancedExpense } from "./index";

export type LedgerDirection = "DEBIT" | "CREDIT";

export type LedgerLine = {
  accountUserId: string;
  counterpartyUserId?: string;
  amountMinor: bigint;
  currency: string;
  direction: LedgerDirection;
};

export function buildExpenseLedgerLines(
  expenseId: string,
  groupCurrency: string,
  payers: readonly { userId: string; groupAmountMinor: bigint }[],
  splits: readonly { userId: string; groupAmountMinor: bigint }[],
): LedgerLine[] {
  validateBalancedExpense(
    payers.reduce((s, p) => s + p.groupAmountMinor, 0n),
    payers.map(p => p.groupAmountMinor),
    splits.map(s => s.groupAmountMinor),
  );

  const lines: LedgerLine[] = [];

  for (const payer of payers) {
    for (const split of splits) {
      if (payer.userId === split.userId) continue;
      const amount = payer.groupAmountMinor < split.groupAmountMinor
        ? payer.groupAmountMinor
        : split.groupAmountMinor;
      if (amount > 0n) {
        lines.push({
          accountUserId: split.userId,
          counterpartyUserId: payer.userId,
          amountMinor: amount,
          currency: groupCurrency,
          direction: "DEBIT",
        });
        lines.push({
          accountUserId: payer.userId,
          counterpartyUserId: split.userId,
          amountMinor: amount,
          currency: groupCurrency,
          direction: "CREDIT",
        });
      }
    }
  }

  return lines;
}
