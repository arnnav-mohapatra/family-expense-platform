import type { PrismaClient } from "@prisma/client";
import { claimIdempotencyKey, completeIdempotencyKey, hashRequest } from "./idempotency";

export type LeaveSpaceInput = {
  spaceId: string;
  userId: string;
  actorUserId: string;
  idempotencyKey: string;
};

async function lockSpace(tx: PrismaClient, spaceId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${spaceId}))`;
}

async function calculateBalance(tx: PrismaClient, spaceId: string, userId: string) {
  const expenses = await tx.expense.findMany({
    where: { spaceId, status: { in: ["ACTIVE", "ADJUSTED"] } },
    include: { payers: true, splits: true },
  });
  let balance = 0n;
  for (const expense of expenses) {
    for (const payer of expense.payers) if (payer.userId === userId) balance += payer.groupAmountMinor;
    for (const split of expense.splits) if (split.userId === userId) balance -= split.groupAmountMinor;
  }
  const settlements = await tx.settlement.findMany({ where: { spaceId, status: "CONFIRMED" } });
  for (const settlement of settlements) {
    if (settlement.payerId === userId) balance += settlement.amountMinor;
    if (settlement.receiverId === userId) balance -= settlement.amountMinor;
  }
  return balance;
}

export async function leaveSpace(db: PrismaClient, input: LeaveSpaceInput) {
  const requestHash = hashRequest(input);
  return db.$transaction(async tx => {
    await lockSpace(tx as unknown as PrismaClient, input.spaceId);

    const idem = await claimIdempotencyKey(tx, "leave-space", input.idempotencyKey, requestHash);
    if (idem.replay) return { replay: true, response: idem.response, statusCode: idem.statusCode ?? 200 };

    const space = await tx.space.findUnique({ where: { id: input.spaceId } });
    if (!space || space.status !== "ACTIVE") throw new Error("SPACE_NOT_ACTIVE");

    const actor = await tx.spaceMember.findUnique({
      where: { spaceId_userId: { spaceId: input.spaceId, userId: input.actorUserId } },
    });
    if (!actor || actor.status !== "ACTIVE") throw new Error("ACTOR_NOT_ACTIVE_MEMBER");

    const member = await tx.spaceMember.findUnique({
      where: { spaceId_userId: { spaceId: input.spaceId, userId: input.userId } },
    });
    if (!member || member.status !== "ACTIVE") throw new Error("MEMBERSHIP_NOT_ACTIVE");

    if (member.role === "OWNER") {
      const activeOwners = await tx.spaceMember.count({
        where: { spaceId: input.spaceId, role: "OWNER", status: "ACTIVE" },
      });
      if (activeOwners <= 1) throw new Error("OWNER_MUST_TRANSFER_OWNERSHIP_BEFORE_LEAVING");
    }

    const balance = await calculateBalance(tx as unknown as PrismaClient, input.spaceId, input.userId);
    if (balance !== 0n) throw new Error("MEMBER_HAS_OUTSTANDING_BALANCE");

    const now = new Date();
    await tx.spaceMember.update({
      where: { spaceId_userId: { spaceId: input.spaceId, userId: input.userId } },
      data: { status: "LEFT", leftAt: now },
    });

    const response = {
      spaceId: input.spaceId,
      userId: input.userId,
      status: "LEFT",
      leftAt: now.toISOString(),
    };

    await tx.auditEvent.create({
      data: {
        spaceId: input.spaceId,
        actorUserId: input.actorUserId,
        action: "SPACE_MEMBER_LEFT",
        entityType: "SPACE_MEMBER",
        entityId: input.userId,
        metadata: response,
      },
    });
    await completeIdempotencyKey(tx, "leave-space", input.idempotencyKey, response, 200);
    return { replay: false, response, statusCode: 200 };
  }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
}
