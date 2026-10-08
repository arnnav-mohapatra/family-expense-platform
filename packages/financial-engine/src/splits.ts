export type SplitMode = "EQUAL" | "EXACT" | "PERCENTAGE" | "SHARES";
export type SplitInput = { userId: string; value: bigint };

function assertUnique(ids: string[]) {
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate participants are not allowed");
}

export function splitByExact(totalMinor: bigint, inputs: SplitInput[]): Map<string, bigint> {
  if (totalMinor <= 0n || inputs.length === 0) throw new Error("Invalid split");
  assertUnique(inputs.map(x => x.userId));
  if (inputs.some(x => x.value < 0n)) throw new Error("Split amounts cannot be negative");
  if (inputs.reduce((a, x) => a + x.value, 0n) !== totalMinor) throw new Error("Exact split must equal the expense total");
  return new Map(inputs.map(x => [x.userId, x.value]));
}

export function splitByPercentage(totalMinor: bigint, inputs: SplitInput[]): Map<string, bigint> {
  if (totalMinor <= 0n || inputs.length === 0) throw new Error("Invalid split");
  assertUnique(inputs.map(x => x.userId));
  const basisPoints = inputs.reduce((a, x) => a + x.value, 0n);
  if (basisPoints !== 10000n) throw new Error("Percentages must total 100%");
  const sorted = [...inputs].sort((a, b) => a.userId.localeCompare(b.userId));
  const result = new Map<string, bigint>();
  let allocated = 0n;
  for (const item of sorted) {
    const amount = (totalMinor * item.value) / 10000n;
    result.set(item.userId, amount);
    allocated += amount;
  }
  let remainder = totalMinor - allocated;
  for (const item of sorted) {
    if (remainder === 0n) break;
    result.set(item.userId, (result.get(item.userId) ?? 0n) + 1n);
    remainder -= 1n;
  }
  return result;
}

export function splitByShares(totalMinor: bigint, inputs: SplitInput[]): Map<string, bigint> {
  if (totalMinor <= 0n || inputs.length === 0) throw new Error("Invalid split");
  assertUnique(inputs.map(x => x.userId));
  if (inputs.some(x => x.value <= 0n)) throw new Error("Shares must be positive");
  const totalShares = inputs.reduce((a, x) => a + x.value, 0n);
  const sorted = [...inputs].sort((a, b) => a.userId.localeCompare(b.userId));
  const result = new Map<string, bigint>();
  let allocated = 0n;
  for (const item of sorted) {
    const amount = (totalMinor * item.value) / totalShares;
    result.set(item.userId, amount);
    allocated += amount;
  }
  let remainder = totalMinor - allocated;
  for (const item of sorted) {
    if (remainder === 0n) break;
    result.set(item.userId, (result.get(item.userId) ?? 0n) + 1n);
    remainder -= 1n;
  }
  return result;
}

export function calculateSplit(totalMinor: bigint, mode: SplitMode, inputs: SplitInput[]) {
  if (mode === "EQUAL") {
    const sorted = [...inputs].sort((a, b) => a.userId.localeCompare(b.userId));
    if (sorted.length === 0 || totalMinor <= 0n) throw new Error("Invalid split");
    const base = totalMinor / BigInt(sorted.length);
    let remainder = totalMinor % BigInt(sorted.length);
    const result = new Map<string, bigint>();
    for (const item of sorted) {
      result.set(item.userId, base + (remainder > 0n ? 1n : 0n));
      if (remainder > 0n) remainder -= 1n;
    }
    return result;
  }
  if (mode === "EXACT") return splitByExact(totalMinor, inputs);
  if (mode === "PERCENTAGE") return splitByPercentage(totalMinor, inputs);
  return splitByShares(totalMinor, inputs);
}
