import { describe, expect, it } from "vitest";
import { buildExpenseLedgerLines } from "./ledger";

describe("expense ledger", () => {
  it("creates balanced deterministic lines from net balances", () => {
    const lines = buildExpenseLedgerLines(
      "expense-1",
      "INR",
      [{ userId: "A", groupAmountMinor: 1000n }],
      [
        { userId: "A", groupAmountMinor: 250n },
        { userId: "B", groupAmountMinor: 750n },
      ],
    );

    expect(lines).toEqual([
      { accountUserId: "B", counterpartyUserId: "A", amountMinor: 750n, currency: "INR", direction: "DEBIT", sourceId: "expense-1" },
      { accountUserId: "A", counterpartyUserId: "B", amountMinor: 750n, currency: "INR", direction: "CREDIT", sourceId: "expense-1" },
    ]);
  });

  it("handles multiple payers without double counting", () => {
    const lines = buildExpenseLedgerLines(
      "expense-2",
      "INR",
      [
        { userId: "A", groupAmountMinor: 600n },
        { userId: "B", groupAmountMinor: 400n },
      ],
      [
        { userId: "A", groupAmountMinor: 500n },
        { userId: "B", groupAmountMinor: 100n },
        { userId: "C", groupAmountMinor: 400n },
      ],
    );

    expect(lines).toEqual([
      { accountUserId: "C", counterpartyUserId: "A", amountMinor: 400n, currency: "INR", direction: "DEBIT", sourceId: "expense-2" },
      { accountUserId: "A", counterpartyUserId: "C", amountMinor: 400n, currency: "INR", direction: "CREDIT", sourceId: "expense-2" },
    ]);
  });
});
