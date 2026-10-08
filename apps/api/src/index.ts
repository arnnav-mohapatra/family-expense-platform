import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { assertCurrency, assertPositiveMinorUnits } from "@family-expense/domain";
import { splitEqually, validateBalancedExpense } from "@family-expense/financial-engine";
import { getDatabaseClient, createExpense, createSettlement, confirmSettlement, getSpaceBalances, leaveSpace, voidExpense } from "@family-expense/database";

export type CreateExpenseCommand = {
  spaceId: string; description: string; currency: string; amountMinor: bigint; payerId: string; participantIds: string[];
};

export function prepareEqualExpense(command: CreateExpenseCommand) {
  assertCurrency(command.currency); assertPositiveMinorUnits(command.amountMinor);
  if (!command.spaceId || !command.description.trim() || !command.payerId) throw new Error("Missing required expense fields");
  const splits = splitEqually(command.amountMinor, command.participantIds);
  validateBalancedExpense(command.amountMinor, [command.amountMinor], [...splits.values()]);
  return { ...command, currency: command.currency.toUpperCase(), splits };
}

const expenseSchema = z.object({
  spaceId: z.string().min(1), actorUserId: z.string().min(1), description: z.string().trim().min(1).max(500),
  expenseDate: z.string().datetime(), currency: z.string().length(3), amountMinor: z.string().regex(/^[1-9]\d*$/),
  groupAmountMinor: z.string().regex(/^[1-9]\d*$/), groupCurrency: z.string().length(3),
  payers: z.array(z.object({ userId: z.string().min(1), amountMinor: z.string().regex(/^[1-9]\d*$/), groupAmountMinor: z.string().regex(/^[1-9]\d*$/) })).min(1),
  splits: z.array(z.object({ userId: z.string().min(1), amountMinor: z.string().regex(/^[1-9]\d*$/), groupAmountMinor: z.string().regex(/^[1-9]\d*$/), splitType: z.enum(["EQUAL","EXACT","PERCENTAGE","SHARES","ITEMIZED"]).optional() })).min(1),
  fxRate: z.string().optional(), fxSource: z.string().max(100).optional(), fxTimestamp: z.string().datetime().optional(),
  idempotencyKey: z.string().min(8).max(200),
});
const settlementSchema = z.object({
  spaceId: z.string().min(1), actorUserId: z.string().min(1), payerId: z.string().min(1), receiverId: z.string().min(1),
  amountMinor: z.string().regex(/^[1-9]\d*$/), currency: z.string().length(3), method: z.string().trim().min(1).max(50), idempotencyKey: z.string().min(8).max(200),
});
const confirmSchema = z.object({
  spaceId: z.string().min(1), actorUserId: z.string().min(1), settlementId: z.string().min(1), idempotencyKey: z.string().min(8).max(200),
});
const leaveSchema = z.object({ actorUserId: z.string().min(1), idempotencyKey: z.string().min(8).max(200) });
const voidExpenseSchema = z.object({ actorUserId: z.string().min(1), reason: z.string().trim().min(3).max(500), idempotencyKey: z.string().min(8).max(200) });
function bigint(value: string) { return BigInt(value); }

export function buildApp(db = getDatabaseClient()): FastifyInstance {
  const app = Fastify({ logger: true });
  app.setErrorHandler((error, _request, reply) => {
    const status = error.name === "ZodError" ? 400 : 409;
    reply.code(status).send({ error: error.message, code: error.message });
  });
  app.get("/health", async () => ({ status: "ok", service: "family-expense-api" }));

  app.post("/expenses", async (request, reply) => {
    const body = expenseSchema.parse(request.body);
    const result = await createExpense(db, {
      ...body, expenseDate: new Date(body.expenseDate), amountMinor: bigint(body.amountMinor), groupAmountMinor: bigint(body.groupAmountMinor),
      payers: body.payers.map(p => ({ ...p, amountMinor: bigint(p.amountMinor), groupAmountMinor: bigint(p.groupAmountMinor) })),
      splits: body.splits.map(s => ({ ...s, amountMinor: bigint(s.amountMinor), groupAmountMinor: bigint(s.groupAmountMinor) })),
      fxTimestamp: body.fxTimestamp ? new Date(body.fxTimestamp) : undefined,
    });
    reply.code(result.statusCode).send(result.response);
  });

  app.post("/settlements", async (request, reply) => {
    const body = settlementSchema.parse(request.body);
    const result = await createSettlement(db, { ...body, amountMinor: bigint(body.amountMinor) });
    reply.code(result.statusCode).send(result.response);
  });

  app.post("/settlements/:settlementId/confirm", async (request, reply) => {
    const params = z.object({ settlementId: z.string().min(1) }).parse(request.params);
    const body = confirmSchema.parse(request.body);
    const result = await confirmSettlement(db, { ...body, settlementId: params.settlementId });
    reply.code(result.statusCode).send(result.response);
  });

  app.get("/spaces/:spaceId/balances", async (request, reply) => {
    const params = z.object({ spaceId: z.string().min(1) }).parse(request.params);
    const rows = await getSpaceBalances(db, params.spaceId);
    reply.send(rows.map(row => ({ ...row, balanceMinor: row.balanceMinor.toString() })));
  });

  app.post("/expenses/:expenseId/void", async (request, reply) => {\n    const params = z.object({ expenseId: z.string().min(1) }).parse(request.params);\n    const body = voidExpenseSchema.parse(request.body);\n    const spaceId = z.string().min(1).parse(request.headers["x-space-id"]);\n    const result = await voidExpense(db, { ...params, ...body, spaceId });\n    reply.code(result.statusCode).send(result.response);\n  });\n\n  app.post("/spaces/:spaceId/members/:userId/leave", async (request, reply) => {
    const params = z.object({ spaceId: z.string().min(1), userId: z.string().min(1) }).parse(request.params);
    const body = leaveSchema.parse(request.body);
    const result = await leaveSpace(db, { ...params, ...body });
    reply.code(result.statusCode).send(result.response);
  });

  return app;
}

export { expenseSchema, settlementSchema, confirmSchema, leaveSchema, voidExpenseSchema };
