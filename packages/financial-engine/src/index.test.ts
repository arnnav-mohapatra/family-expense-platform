import { describe, expect, it } from "vitest";
import { simplifyDebts } from "./index";

describe("simplifyDebts", () => {
  it("matches deterministic debtors to creditors", () => {
    const result = simplifyDebts(new Map([
      ["A", 10000n],
      ["B", -6000n],
      ["C", -4000n]
    ]));
    expect(result).toEqual([
      { from: "B", to: "A", amountMinor: 6000n },
      { from: "C", to: "A", amountMinor: 4000n }
    ]);
  });
});
