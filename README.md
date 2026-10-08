# Family Expense Platform

Production-grade, local-first expense and settlement platform for families, households, trips, and friend groups.

## Core principles

- Never mutate financial history; corrections are adjustment entries.
- Server-authoritative financial ledger with deterministic offline reconciliation.
- Historical FX rates are snapshotted per expense.
- Financial invariants are enforced in domain and persistence layers.
- Build incrementally through tested vertical slices.

## Planned apps

- `apps/mobile` — Expo React Native
- `apps/web` — Next.js
- `apps/api` — TypeScript API

## Planned shared packages

- `packages/domain`
- `packages/financial-engine`
- `packages/sync-engine`
- `packages/validation`
- `packages/api-client`
- `packages/types`
- `packages/ui`

## First vertical slice

Register/login → create space → invite member → add expense → split → ledger → balances → debt simplification → settlement → audit → adjustment.
