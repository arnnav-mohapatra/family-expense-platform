import type { PrismaClient } from "@prisma/client";
import { claimIdempotencyKey, completeIdempotencyKey, hashRequest } from "./idempotency";

export type VoidExpenseInput = {
  spaceId: string;
  expenseId: string;
  actorUserId: string;
  reason: string;
  idempotencyKey: string;
};

async function lockSpace(tx: PrismaClient, spaceId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${spaceId}))`;
}

export async function voidExpense(db: PrismaClient, input: VoidExpenseInput) {
  if (!input.reason.trim()) throw new Error("ADJUSTMENT_REASON_REQUIRED");
  const requestHash = hashRequest(input);

  return db.$transaction(async tx => {
    await lockSpace(tx as unknown as PrismaClient, input.spaceId);
    const idem = await claimIdempotencyKey(tx, "void-expense", input.idempotencyKey, requestHash);
    if (idem.replay) return { replay: true, response: idem.response, statusCode: idem.statusCode ?? 200 };

    const expense = await tx.expense.findUnique({
      where: { id: input.expenseId },
      include: { ledgerEntries: true },
    });
    if (!expense || expense.spaceId !== input.spaceId) throw new Error("EXPENSE_NOT_FOUND");
    if (expense.status === "VOIDED") throw new Error("EXPENSE_ALREADY_VOIDED");
    if (expense.status !== "ACTIVE" && expense.status !== "ADJUSTED") throw new Error("EXPENSE_NOT_ADJUSTABLE");

    const confirmedAllocation = await tx.settlementAllocation.findFirst({
      where: { expenseId: expense.id, settlement: { status: "CONFIRMED" } },
      select: { id: true },
    });
    if (confirmedAllocation) throw new Error("SETTLED_EXPENSE_REQUIRES_CORRECTION_NOT_VOID");

    const actor = await tx.spaceMember.findUnique({
      where: { spaceId_userId: { spaceId: input.spaceId, userId: input.actorUserId } },
    });
    if (!actor || actor.status !== "ACTIVE") throw new Error("ACTOR_NOT_ACTIVE_MEMBER");

    const last = await tx.ledgerEntry.findFirst({
      where: { spaceId: input.spaceId },
      orderBy: { sequenceNumber: "desc" },
      select: { sequenceNumber: true },
    });
    let sequence = (last?.sequenceNumber ?? 0n) + 1n;

    const reversals = expense.ledgerEntries.map(entry => ({
      spaceId: input.spaceId,
      expenseId: expense.id,
      eventType: "EXPENSE_VOIDED",
      sourceId: expense.id,
      accountUserId: entry.accountUserId,
      counterpartyUserId: entry.counterpartyUserId,
      currency: entry.currency,
      amountMinor: entry.amountMinor,
      direction: entry.direction === "DEBIT" ? "CREDIT" as const : "DEBIT" as const,
      sequenceNumber: sequence++,
    }));
    if (reversals.length) await tx.ledgerEntry.createMany({ data: reversals });

    const updated = await tx.expense.update({
      where: { id: expense.id },
      data: { status: "VOIDED", version: { increment: 1 } },
    });
    const adjustment = await tx.expenseAdjustment.create({
      data: {
        expenseId: expense.id, spaceId: input.spaceId, createdById: input.actorUserId,
        type: "VOID", reason: input.reason.trim(),
      },
    });

    const response = {
      expenseId: updated.id,
      status: updated.status,
      version: updated.version,
      adjustmentId: adjustment.id,
    };
    await tx.auditEvent.create({
      data: {
        spaceId: input.spaceId, actorUserId: input.actorUserId, action: "EXPENSE_VOIDED",
        entityType: "EXPENSE", entityId: expense.id,
        previousVersion: expense.version, newVersion: updated.version, metadata: response,
      },
    });
    await completeIdempotencyKey(tx, "void-expense", input.idempotencyKey, response, 200);
    return { replay: false, response, statusCode: 200 };
  }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
}
