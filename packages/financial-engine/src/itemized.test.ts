import { describe, expect, it } from "vitest";
import { calculateItemizedSplit } from "./itemized";

describe("itemized expenses", () => {
  it("aggregates item assignments into participant splits", () => {
    const result = calculateItemizedSplit(1500n, [
      {
        itemId: "coffee",
        totalMinor: 500n,
        assignments: [
          { userId: "a", amountMinor: 250n },
          { userId: "b", amountMinor: 250n },
        ],
      },
      {
        itemId: "lunch",
        totalMinor: 1000n,
        assignments: [{ userId: "a", amountMinor: 1000n }],
      },
    ]);

    expect(result.splits).toEqual(new Map([["a", 1250n], ["b", 250n]]));
  });

  it("rejects item totals that do not reconcile", () => {
    expect(() =>
      calculateItemizedSplit(1000n, [
        { itemId: "x", totalMinor: 900n, assignments: [{ userId: "a", amountMinor: 900n }] },
      ]),
    ).toThrow("Item totals must equal the expense total");
  });

  it("rejects incomplete item assignments", () => {
    expect(() =>
      calculateItemizedSplit(1000n, [
        { itemId: "x", totalMinor: 1000n, assignments: [{ userId: "a", amountMinor: 900n }] },
      ]),
    ).toThrow("Item assignments must equal the item total");
  });
});
