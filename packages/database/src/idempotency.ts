import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

export function hashRequest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function claimIdempotencyKey(
  db: PrismaClient,
  scope: string,
  key: string,
  requestHash: string,
): Promise<{ replay: boolean; response: unknown; statusCode: number | null }> {
  const existing = await db.idempotencyKey.findUnique({ where: { scope_key: { scope, key } } });

  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new Error("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST");
    }
    return { replay: true, response: existing.response, statusCode: existing.statusCode };
  }

  try {
    await db.idempotencyKey.create({
      data: { scope, key, requestHash },
    });
    return { replay: false, response: null, statusCode: null };
  } catch {
    const raced = await db.idempotencyKey.findUnique({ where: { scope_key: { scope, key } } });
    if (!raced) throw new Error("IDEMPOTENCY_CLAIM_FAILED");
    if (raced.requestHash !== requestHash) {
      throw new Error("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST");
    }
    return { replay: true, response: raced.response, statusCode: raced.statusCode };
  }
}

export async function completeIdempotencyKey(
  db: PrismaClient,
  scope: string,
  key: string,
  response: unknown,
  statusCode: number,
): Promise<void> {
  await db.idempotencyKey.update({
    where: { scope_key: { scope, key } },
    data: { response: response as object, statusCode },
  });
}
