export type ItemizedItem = {
  itemId: string;
  totalMinor: bigint;
  assignments: { userId: string; amountMinor: bigint }[];
};

export type ItemizedValidation = {
  splits: Map<string, bigint>;
  itemCount: number;
};

function assertUnique(ids: string[]) {
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate item IDs are not allowed");
}

export function calculateItemizedSplit(
  totalMinor: bigint,
  items: readonly ItemizedItem[],
): ItemizedValidation {
  if (totalMinor <= 0n) throw new Error("Expense total must be positive");
  if (!items.length) throw new Error("At least one item is required");

  assertUnique(items.map(item => item.itemId));

  const splits = new Map<string, bigint>();
  let itemTotal = 0n;

  for (const item of items) {
    if (item.totalMinor <= 0n) throw new Error("Item totals must be positive");
    if (!item.assignments.length) throw new Error("Every item must have at least one participant");
    if (item.assignments.some(a => a.amountMinor < 0n)) {
      throw new Error("Item assignments cannot be negative");
    }

    const assignmentTotal = item.assignments.reduce((sum, a) => sum + a.amountMinor, 0n);
    if (assignmentTotal !== item.totalMinor) {
      throw new Error("Item assignments must equal the item total");
    }

    for (const assignment of item.assignments) {
      splits.set(
        assignment.userId,
        (splits.get(assignment.userId) ?? 0n) + assignment.amountMinor,
      );
    }

    itemTotal += item.totalMinor;
  }

  if (itemTotal !== totalMinor) {
    throw new Error("Item totals must equal the expense total");
  }

  return { splits, itemCount: items.length };
}
