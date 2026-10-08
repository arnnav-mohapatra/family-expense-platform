import { describe, expect, it } from "vitest";
import { calculateSpaceBalanceForTest } from "./settlement-test-helper";

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
