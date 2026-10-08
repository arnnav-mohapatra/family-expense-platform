export type BalanceMap = ReadonlyMap<string, bigint>;
export type Transaction = { from: string; to: string; amountMinor: bigint };

export function validateBalancedExpense(
  totalMinor: bigint,
  payerAmounts: bigint[],
  splitAmounts: bigint[],
): void {
  if (totalMinor <= 0n) throw new Error("Expense total must be positive");
  if (payerAmounts.some(a => a < 0n) || splitAmounts.some(a => a < 0n)) {
    throw new Error("Amounts cannot be negative");
  }
  if (payerAmounts.reduce((s, a) => s + a, 0n) !== totalMinor) {
    throw new Error("Payer amounts must equal expense total");
  }
  if (splitAmounts.reduce((s, a) => s + a, 0n) !== totalMinor) {
    throw new Error("Split amounts must equal expense total");
  }
}

export function splitEqually(totalMinor: bigint, memberIds: readonly string[]): Map<string, bigint> {
  if (totalMinor < 0n) throw new Error("Total cannot be negative");
  if (!memberIds.length) throw new Error("At least one member is required");

  const ids = [...memberIds].sort((a, b) => a.localeCompare(b));
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate members are not allowed");

  const base = totalMinor / BigInt(ids.length);
  let remainder = totalMinor % BigInt(ids.length);
  const result = new Map<string, bigint>();

  for (const id of ids) {
    result.set(id, base + (remainder > 0n ? 1n : 0n));
    if (remainder > 0n) remainder -= 1n;
  }

  return result;
}

export function calculateBalances(
  payers: readonly { userId: string; amountMinor: bigint }[],
  splits: readonly { userId: string; amountMinor: bigint }[],
): Map<string, bigint> {
  const balances = new Map<string, bigint>();

  for (const payer of payers) {
    balances.set(payer.userId, (balances.get(payer.userId) ?? 0n) + payer.amountMinor);
  }

  for (const split of splits) {
    balances.set(split.userId, (balances.get(split.userId) ?? 0n) - split.amountMinor);
  }

  return balances;
}

export function simplifyDebts(balances: BalanceMap): Transaction[] {
  const debtors = [...balances]
    .filter(([, amount]) => amount < 0n)
    .map(([id, amount]) => ({ id, amount: -amount }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const creditors = [...balances]
    .filter(([, amount]) => amount > 0n)
    .map(([id, amount]) => ({ id, amount }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const result: Transaction[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex]!;
    const creditor = creditors[creditorIndex]!;
    const amount = debtor.amount < creditor.amount ? debtor.amount : creditor.amount;

    if (amount > 0n) {
      result.push({ from: debtor.id, to: creditor.id, amountMinor: amount });
    }

    debtor.amount -= amount;
    creditor.amount -= amount;

    if (debtor.amount === 0n) debtorIndex += 1;
    if (creditor.amount === 0n) creditorIndex += 1;
  }

  return result;
}

export {
  calculateSplit,
  splitByExact,
  splitByPercentage,
  splitByShares,
} from "./splits";

export type { SplitMode, SplitInput } from "./splits";
export { calculateItemizedSplit } from "./itemized";
export type { ItemizedItem, ItemizedValidation } from "./itemized";
