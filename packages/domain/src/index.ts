export type SpaceType = "HOUSEHOLD" | "FAMILY" | "TRIP" | "FRIENDS" | "CUSTOM";

export type AccountType = "REGISTERED" | "MANAGED" | "GHOST";

export type SplitType = "EQUAL" | "EXACT" | "PERCENTAGE" | "SHARES" | "ITEMIZED";

export type Money = {
  amountMinor: bigint;
  currency: string;
};

export type Expense = {
  id: string;
  spaceId: string;
  description: string;
  original: Money;
  groupAmountMinor: bigint;
  groupCurrency: string;
  fxRate: string;
  createdBy: string;
  version: number;
};
