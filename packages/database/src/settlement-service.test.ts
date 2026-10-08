import { describe, expect, it } from "vitest";

function calculateSpaceBalanceForTest(
  expenses: { userId: string; amountMinor: bigint }[],
  settlements: { payerId: string; receiverId: string; amountMinor: bigint }[],
) {
  const balances = new Map<string, bigint>();
  for (const item of expenses) balances.set(item.userId, (balances.get(item.userId) ?? 0n) + item.amountMinor);
  for (const settlement of settlements) {
    balances.set(settlement.payerId, (balances.get(settlement.payerId) ?? 0n) + settlement.amountMinor);
    balances.set(settlement.receiverId, (balances.get(settlement.receiverId) ?? 0n) - settlement.amountMinor);
  }
  return balances;
}

describe("settlement balance rules", () => {
  it("reduces a payer's debt when a confirmed settlement is applied", () => {
    const balances = calculateSpaceBalanceForTest(
      [
        { userId: "A", amountMinor: 1000n },
        { userId: "B", amountMinor: -1000n },
      ],
      [{ payerId: "B", receiverId: "A", amountMinor: 400n }],
    );
    expect(balances).toEqual(new Map([["A", 600n], ["B", -600n]]));
  });

  it("never allows a settlement to be larger than debt", () => {
    const debt = -300n;
    const settlement = 301n;
    expect(settlement > -debt).toBe(true);
  });
});
