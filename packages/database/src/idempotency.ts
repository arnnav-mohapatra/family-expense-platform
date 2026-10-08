import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

function canonicalize(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonicalize(v)]),
    );
  }
  return value;
}

export function hashRequest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
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

  await db.idempotencyKey.createMany({
    data: [{ scope, key, requestHash }],
    skipDuplicates: true,
  });
  const claimed = await db.idempotencyKey.findUnique({ where: { scope_key: { scope, key } } });
  if (!claimed) throw new Error("IDEMPOTENCY_CLAIM_FAILED");
  if (claimed.requestHash !== requestHash) {
    throw new Error("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST");
  }
  return { replay: claimed.response !== null, response: claimed.response, statusCode: claimed.statusCode };
}

export async function completeIdempotencyKey(
  db: PrismaClient,
  scope: string,
  key: string,
  response: unknown,
  statusCode: number,
): Promise<void> {
  const jsonResponse = canonicalize(response) as object;
  await db.idempotencyKey.update({
    where: { scope_key: { scope, key } },
    data: { response: jsonResponse, statusCode },
  });
}
