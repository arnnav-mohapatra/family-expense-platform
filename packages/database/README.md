# Database layer

The next database increment will add PostgreSQL/Prisma persistence for spaces, memberships, expenses, payers, splits, immutable ledger entries, settlements, audit events, and idempotency keys.

Financial writes will use database transactions and append-only records; read projections remain rebuildable.