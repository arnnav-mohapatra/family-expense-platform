import { PrismaClient } from "@prisma/client";

export type DatabaseClient = PrismaClient;

let client: PrismaClient | undefined;

export function getDatabaseClient(): PrismaClient {
  if (!client) {
    client = new PrismaClient();
  }
  return client;
}

export async function disconnectDatabase(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}
