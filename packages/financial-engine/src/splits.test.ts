import { describe, expect, it } from "vitest";
import { splitByExact, splitByPercentage, splitByShares } from "./splits";

describe("split modes", () => {
  it("validates exact splits", () => {
    expect(splitByExact(100n, [{ userId: "a", value: 40n }, { userId: "b", value: 60n }]))
      .toEqual(new Map([["a", 40n], ["b", 60n]]));
  });
  it("handles percentage remainders deterministically", () => {
    expect(splitByPercentage(101n, [{ userId: "b", value: 5000n }, { userId: "a", value: 5000n }]))
      .toEqual(new Map([["a", 51n], ["b", 50n]]));
  });
  it("handles shares", () => {
    expect(splitByShares(100n, [{ userId: "a", value: 1n }, { userId: "b", value: 3n]]).get("b")).toBe(75n);
  });
});
