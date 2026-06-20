# AGENTS.md

## Monorepo layout

Two independent projects — no root `package.json`. Always scope commands to a subdirectory:

```
backend/   → NestJS API (port 3000)
frontend/  → React + Vite SPA
```

## Package manager

**pnpm** for both projects. There is no root workspace linking them.

## Backend

### Environment

A `.env` file is **required** in `backend/` with two Supabase PostgreSQL URLs:

| Variable | Port | Purpose |
|---|---|---|
| `DATABASE_URL` | 6543 (pgBouncer) | Pooled connections (not used by app) |
| `DIRECT_URL` | 5432 (direct TCP) | Used by Prisma adapter and migrations |

The `.env` is gitignored. Without it, the app won't start.

### Prisma

- **Adapter**: `@prisma/adapter-pg` with direct TCP via `DIRECT_URL` (`backend/src/prisma/prisma.service.ts:10-12`).
- **Config**: `prisma.config.ts` reads `DIRECT_URL` for migrations. Uses `import "dotenv/config"` — Prisma 7 does **not** auto-load `.env`.
- **Generate** after schema changes: `pnpm prisma generate` (generated client at `backend/generated/prisma/`).
- **Migrate**: `pnpm prisma migrate dev` (reads `prisma.config.ts`, uses `DIRECT_URL`).
- **Schema**: `backend/prisma/schema.prisma` — 13 models, 6 enums. Full billing domain (Company → Branch → User/Customer/Product → Inventory → Sale → Loan).

### Architecture

- `PrismaService` is `@Global()` (`backend/src/prisma/prisma.module.ts:6`) — injectable everywhere without module imports.
- Modules follow NestJS CLI conventions: `controller → service → module`, each in its own directory.
- Only `ProductsModule` is wired into `AppModule`. Directories `categories/`, `inventory/`, `loans/`, `sales/` are empty placeholders — not yet registered.

### Commands

Run all from `backend/`:

| Command | What |
|---|---|
| `pnpm start:dev` | Dev server with hot reload |
| `pnpm test` | Unit tests (`*.spec.ts`) |
| `pnpm test:e2e` | E2E tests (`*.e2e-spec.ts`) — needs DB connection |
| `pnpm lint` | ESLint (`{src,test}/**/*.ts`) |
| `pnpm format` | Prettier (`src/**/*.ts test/**/*.ts`) |
| `pnpm build` | `nest build` → `dist/` |

### Testing

- Jest 30 + ts-jest. Config in `package.json` (unit) and `test/jest-e2e.json` (e2e).
- E2E tests use `supertest` and require the database to be reachable.
- Test files match `*.spec.ts` or `*.e2e-spec.ts`.

### Code style

- Prettier: `singleQuote: true`, `trailingComma: "all"`.
- ESLint: flat config with `typescript-eslint` recommended-type-checked + prettier plugin.
- TS: `nodenext` modules, decorators enabled, `strictNullChecks`, `noImplicitAny: false`.

### No auth yet

`User` model has `passwordHash` but no guards, JWT, or auth module exist. This is pending work.

## Frontend

### Commands

Run all from `frontend/`:

| Command | What |
|---|---|
| `pnpm dev` | Vite dev server |
| `pnpm build` | `tsc -b && vite build` |
| `pnpm lint` | ESLint |

### Notes

- React 19 + Vite 8 + TS 6.0.2.
- No test setup yet.
- No API client configured — still the default Vite template.
- TS strict: `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `verbatimModuleSyntax`.
