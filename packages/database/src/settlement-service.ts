import type { PrismaClient } from "@prisma/client";
import { assertCurrency, assertPositiveMinorUnits } from "@family-expense/domain";
import { claimIdempotencyKey, completeIdempotencyKey, hashRequest } from "./idempotency";

export type CreateSettlementInput = {
  spaceId: string;
  actorUserId: string;
  payerId: string;
  receiverId: string;
  amountMinor: bigint;
  currency: string;
  method: string;
  idempotencyKey: string;
};

export type ConfirmSettlementInput = {
  spaceId: string;
  actorUserId: string;
  settlementId: string;
  idempotencyKey: string;
};

function serializeSettlement(s: {
  id: string;
  amountMinor: bigint;
  currency: string;
  status: string;
}) {
  return {
    settlementId: s.id,
    amountMinor: s.amountMinor.toString(),
    currency: s.currency,
    status: s.status,
  };
}

export async function createSettlement(db: PrismaClient, input: CreateSettlementInput) {
  const currency = assertCurrency(input.currency);
  assertPositiveMinorUnits(input.amountMinor);
  if (input.payerId === input.receiverId) throw new Error("SETTLEMENT_PARTIES_MUST_DIFFER");
  if (!input.method.trim()) throw new Error("SETTLEMENT_METHOD_REQUIRED");

  const requestHash = hashRequest({ ...input, currency });

  return db.$transaction(async tx => {
    const idem = await claimIdempotencyKey(tx, "create-settlement", input.idempotencyKey, requestHash);
    if (idem.replay) return { replay: true, response: idem.response, statusCode: idem.statusCode ?? 201 };

    const space = await tx.space.findUnique({ where: { id: input.spaceId } });
    if (!space || space.status !== "ACTIVE") throw new Error("SPACE_NOT_ACTIVE");
    if (currency !== space.defaultCurrency) throw new Error("SETTLEMENT_CURRENCY_MUST_MATCH_SPACE");

    const members = await tx.spaceMember.findMany({
      where: {
        spaceId: input.spaceId,
        userId: { in: [input.payerId, input.receiverId, input.actorUserId] },
        status: "ACTIVE",
      },
      select: { userId: true },
    });
    if (members.length !== new Set([input.payerId, input.receiverId, input.actorUserId]).size) {
      throw new Error("ALL_SETTLEMENT_PARTIES_MUST_BE_ACTIVE_MEMBERS");
    }

    const balances = await calculateSpaceBalances(tx, input.spaceId);
    const payerBalance = balances.get(input.payerId) ?? 0n;
    if (payerBalance >= 0n) throw new Error("PAYER_HAS_NO_OUTSTANDING_DEBT");
    if (input.amountMinor > -payerBalance) throw new Error("SETTLEMENT_EXCEEDS_OUTSTANDING_BALANCE");

    const settlement = await tx.settlement.create({
      data: {
        spaceId: input.spaceId,
        payerId: input.payerId,
        receiverId: input.receiverId,
        amountMinor: input.amountMinor,
        currency,
        method: input.method.trim(),
        createdById: input.actorUserId,
      },
    });

    const response = serializeSettlement(settlement);
    await tx.auditEvent.create({
      data: {
        spaceId: input.spaceId,
        actorUserId: input.actorUserId,
        action: "SETTLEMENT_CREATED",
        entityType: "SETTLEMENT",
        entityId: settlement.id,
        metadata: response,
      },
    });
    await completeIdempotencyKey(tx, "create-settlement", input.idempotencyKey, response, 201);
    return { replay: false, response, statusCode: 201 };
  }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
}

export async function confirmSettlement(db: PrismaClient, input: ConfirmSettlementInput) {
  const requestHash = hashRequest(input);

  return db.$transaction(async tx => {
    const idem = await claimIdempotencyKey(tx, "confirm-settlement", input.idempotencyKey, requestHash);
    if (idem.replay) return { replay: true, response: idem.response, statusCode: idem.statusCode ?? 200 };

    const settlement = await tx.settlement.findUnique({ where: { id: input.settlementId } });
    if (!settlement || settlement.spaceId !== input.spaceId) throw new Error("SETTLEMENT_NOT_FOUND");
    if (settlement.status === "CONFIRMED") throw new Error("SETTLEMENT_ALREADY_CONFIRMED");
    if (settlement.status !== "PENDING") throw new Error("SETTLEMENT_NOT_CONFIRMABLE");

    await tx.spaceMember.findUniqueOrThrow({
      where: { spaceId_userId: { spaceId: input.spaceId, userId: input.actorUserId } },
    });

    await tx.settlement.update({
      where: { id: settlement.id },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });

    const last = await tx.ledgerEntry.findFirst({
      where: { spaceId: input.spaceId },
      orderBy: { sequenceNumber: "desc" },
      select: { sequenceNumber: true },
    });
    const sequence = (last?.sequenceNumber ?? 0n) + 1n;

    await tx.ledgerEntry.createMany({
      data: [
        {
          spaceId: input.spaceId,
          settlementId: settlement.id,
          eventType: "SETTLEMENT_CONFIRMED",
          sourceId: settlement.id,
          accountUserId: settlement.payerId,
          counterpartyUserId: settlement.receiverId,
          currency: settlement.currency,
          amountMinor: settlement.amountMinor,
          direction: "CREDIT",
          sequenceNumber: sequence,
        },
        {
          spaceId: input.spaceId,
          settlementId: settlement.id,
          eventType: "SETTLEMENT_CONFIRMED",
          sourceId: settlement.id,
          accountUserId: settlement.receiverId,
          counterpartyUserId: settlement.payerId,
          currency: settlement.currency,
          amountMinor: settlement.amountMinor,
          direction: "DEBIT",
          sequenceNumber: sequence + 1n,
        },
      ],
    });

    const response = serializeSettlement({ ...settlement, status: "CONFIRMED" });
    await tx.auditEvent.create({
      data: {
        spaceId: input.spaceId,
        actorUserId: input.actorUserId,
        action: "SETTLEMENT_CONFIRMED",
        entityType: "SETTLEMENT",
        entityId: settlement.id,
        metadata: response,
      },
    });
    await completeIdempotencyKey(tx, "confirm-settlement", input.idempotencyKey, response, 200);
    return { replay: false, response, statusCode: 200 };
  }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
}

async function calculateSpaceBalances(tx: PrismaClient, spaceId: string): Promise<Map<string, bigint>> {
  const balances = new Map<string, bigint>();
  const expenses = await tx.expense.findMany({
    where: { spaceId, status: { in: ["ACTIVE", "ADJUSTED"] } },
    include: { payers: true, splits: true },
  });

  for (const expense of expenses) {
    for (const payer of expense.payers) {
      balances.set(payer.userId, (balances.get(payer.userId) ?? 0n) + payer.groupAmountMinor);
    }
    for (const split of expense.splits) {
      balances.set(split.userId, (balances.get(split.userId) ?? 0n) - split.groupAmountMinor);
    }
  }

  const settlements = await tx.settlement.findMany({
    where: { spaceId, status: "CONFIRMED" },
  });
  for (const settlement of settlements) {
    balances.set(settlement.payerId, (balances.get(settlement.payerId) ?? 0n) + settlement.amountMinor);
    balances.set(settlement.receiverId, (balances.get(settlement.receiverId) ?? 0n) - settlement.amountMinor);
  }
  return balances;
}
