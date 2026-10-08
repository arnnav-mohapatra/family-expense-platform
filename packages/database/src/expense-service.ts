import type { PrismaClient } from "@prisma/client";
import { assertCurrency, assertPositiveMinorUnits } from "@family-expense/domain";
import { buildExpenseLedgerLines } from "@family-expense/financial-engine";
import { claimIdempotencyKey, completeIdempotencyKey, hashRequest } from "./idempotency";

export type CreateExpenseInput = {
  spaceId: string;
  actorUserId: string;
  description: string;
  expenseDate: Date;
  currency: string;
  amountMinor: bigint;
  payers: { userId: string; amountMinor: bigint }[];
  splits: { userId: string; amountMinor: bigint; splitType?: "EQUAL" | "EXACT" | "PERCENTAGE" | "SHARES" | "ITEMIZED" }[];
  fxRate?: string;
  fxSource?: string;
  fxTimestamp?: Date;
  idempotencyKey: string;
};

function responseFor(expense: { id: string; version: number; groupAmountMinor: bigint; groupCurrency: string }) {
  return {
    expenseId: expense.id,
    version: expense.version,
    amountMinor: expense.groupAmountMinor.toString(),
    currency: expense.groupCurrency,
  };
}

export async function createExpense(db: PrismaClient, input: CreateExpenseInput) {
  const currency = assertCurrency(input.currency);
  assertPositiveMinorUnits(input.amountMinor);

  if (!input.description.trim()) throw new Error("DESCRIPTION_REQUIRED");
  if (!input.payers.length) throw new Error("AT_LEAST_ONE_PAYER_REQUIRED");
  if (!input.splits.length) throw new Error("AT_LEAST_ONE_SPLIT_REQUIRED");

  const requestHash = hashRequest({ ...input, currency });

  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.spaceId}))`;

    const idem = await claimIdempotencyKey(tx as unknown as PrismaClient, "create-expense", input.idempotencyKey, requestHash);
    if (idem.replay) return { replay: true, response: idem.response, statusCode: idem.statusCode ?? 201 };

    const membership = await tx.spaceMember.findUnique({
      where: { spaceId_userId: { spaceId: input.spaceId, userId: input.actorUserId } },
    });
    if (!membership || membership.status !== "ACTIVE") throw new Error("ACTOR_NOT_ACTIVE_MEMBER");

    const payerTotal = input.payers.reduce((s, p) => s + p.amountMinor, 0n);
    const splitTotal = input.splits.reduce((s, p) => s + p.amountMinor, 0n);
    if (payerTotal !== input.amountMinor || splitTotal !== input.amountMinor) {
      throw new Error("EXPENSE_NOT_BALANCED");
    }

    const participantIds = new Set([...input.payers.map(p => p.userId), ...input.splits.map(s => s.userId)]);
    const activeMembers = await tx.spaceMember.findMany({
      where: { spaceId: input.spaceId, userId: { in: [...participantIds] }, status: "ACTIVE" },
      select: { userId: true },
    });
    if (activeMembers.length !== participantIds.size) throw new Error("ALL_PARTICIPANTS_MUST_BE_ACTIVE_MEMBERS");

    const space = await tx.space.findUnique({ where: { id: input.spaceId } });
    if (!space || space.status !== "ACTIVE") throw new Error("SPACE_NOT_ACTIVE");

    const expense = await tx.expense.create({
      data: {
        spaceId: input.spaceId,
        createdById: input.actorUserId,
        description: input.description.trim(),
        expenseDate: input.expenseDate,
        originalCurrency: currency,
        originalAmountMinor: input.amountMinor,
        groupCurrency: space.defaultCurrency,
        groupAmountMinor: input.amountMinor,
        fxRate: input.fxRate,
        fxSource: input.fxSource,
        fxTimestamp: input.fxTimestamp,
        payers: { create: input.payers.map(p => ({ userId: p.userId, amountMinor: p.amountMinor, currency, groupAmountMinor: p.amountMinor })) },
        splits: { create: input.splits.map(s => ({ userId: s.userId, splitType: s.splitType ?? "EXACT", groupAmountMinor: s.amountMinor })) },
      },
    });

    const ledger = buildExpenseLedgerLines(
      expense.id,
      space.defaultCurrency,
      input.payers.map(p => ({ userId: p.userId, groupAmountMinor: p.amountMinor })),
      input.splits.map(s => ({ userId: s.userId, groupAmountMinor: s.amountMinor })),
    );

    const last = await tx.ledgerEntry.findFirst({
      where: { spaceId: input.spaceId },
      orderBy: { sequenceNumber: "desc" },
      select: { sequenceNumber: true },
    });
    let sequence = (last?.sequenceNumber ?? 0n) + 1n;

    for (const line of ledger) {
      await tx.ledgerEntry.create({
        data: {
          spaceId: input.spaceId,
          expenseId: expense.id,
          eventType: "EXPENSE_CREATED",
          sourceId: expense.id,
          accountUserId: line.accountUserId,
          counterpartyUserId: line.counterpartyUserId,
          currency: line.currency,
          amountMinor: line.amountMinor,
          direction: line.direction,
          sequenceNumber: sequence++,
        },
      });
    }

    const response = responseFor(expense);
    await tx.auditEvent.create({
      data: {
        spaceId: input.spaceId,
        actorUserId: input.actorUserId,
        action: "EXPENSE_CREATED",
        entityType: "EXPENSE",
        entityId: expense.id,
        newVersion: expense.version,
        metadata: response,
      },
    });
    await completeIdempotencyKey(tx as unknown as PrismaClient, "create-expense", input.idempotencyKey, response, 201);

    return { replay: false, response, statusCode: 201 };
  }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
}
