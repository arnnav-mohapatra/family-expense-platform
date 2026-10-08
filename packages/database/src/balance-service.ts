import type { PrismaClient } from "@prisma/client";

export async function getSpaceBalances(db: PrismaClient, spaceId: string) {
  const balances = new Map<string, bigint>();
  const expenses = await db.expense.findMany({
    where: { spaceId, status: { in: ["ACTIVE", "ADJUSTED"] } },
    include: { payers: true, splits: true },
  });
  for (const expense of expenses) {
    for (const payer of expense.payers) balances.set(payer.userId, (balances.get(payer.userId) ?? 0n) + payer.groupAmountMinor);
    for (const split of expense.splits) balances.set(split.userId, (balances.get(split.userId) ?? 0n) - split.groupAmountMinor);
  }
  const settlements = await db.settlement.findMany({ where: { spaceId, status: "CONFIRMED" } });
  for (const settlement of settlements) {
    balances.set(settlement.payerId, (balances.get(settlement.payerId) ?? 0n) + settlement.amountMinor);
    balances.set(settlement.receiverId, (balances.get(settlement.receiverId) ?? 0n) - settlement.amountMinor);
  }
  return [...balances.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([userId, balanceMinor]) => ({
    userId,
    balanceMinor,
    direction: balanceMinor > 0n ? "CREDIT" : balanceMinor < 0n ? "DEBT" : "SETTLED",
  }));
}
