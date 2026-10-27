# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

"El Bodegón de la Tecnología" — a billing and inventory management system. Monorepo with two independent projects; there is no root `package.json` or workspace linking them.

```
backend/   → NestJS API (port 3000), deployed on Render
frontend/  → React 19 + Vite SPA + PWA (port 5173)
```

Package manager: **pnpm** in both projects.

## Commands

All commands must be run from the relevant subdirectory.

### Backend (`cd backend/`)

| Command | What |
|---|---|
| `pnpm start:dev` | Dev server with hot reload |
| `pnpm build` | Compile to `dist/` |
| `pnpm test` | Unit tests (`*.spec.ts`) |
| `pnpm test:e2e` | E2E tests — requires DB connection |
| `pnpm test -- --testPathPattern=products` | Run a single test file |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier |
| `pnpm prisma generate` | Regenerate client after schema changes |
| `pnpm prisma migrate dev` | Run migrations |

### Frontend (`cd frontend/`)

| Command | What |
|---|---|
| `pnpm dev` | Vite dev server |
| `pnpm build` | `tsc -b && vite build` |
| `pnpm lint` | ESLint |

## Backend architecture

### Environment

`backend/.env` is required with:
- `DATABASE_URL` — port 6543 (pgBouncer pooled, not used by app directly)
- `DIRECT_URL` — port 5432 (used by Prisma adapter and migrations)
- `JWT_SECRET` — secret for signing access tokens

### Prisma

- Client generated to `backend/generated/prisma/` (non-default output path).
- `PrismaModule` is `@Global()` (`src/prisma/prisma.module.ts`) — `PrismaService` is injectable everywhere without re-importing the module.
- Uses `@prisma/adapter-pg` with `DIRECT_URL` for direct TCP connections.
- `prisma.config.ts` loads env manually with `import "dotenv/config"` (Prisma 7 does not auto-load `.env`).

### Module structure

Registered in `AppModule`: `PrismaModule`, `ProductsModule`, `AuthModule`.

Empty placeholder directories not yet wired up: `categories/`, `inventory/`, `loans/`, `sales/`.

Follow NestJS CLI conventions: `controller → service → module`, each feature in its own directory with DTOs in `dto/` and entities in `entities/`.

### Auth

- JWT access tokens (15 min expiry, signed with `JWT_SECRET`).
- Refresh tokens (7 days) stored as random UUIDs in the `RefreshToken` DB table; rotated on each use (old token deleted, new one issued).
- `JwtAuthGuard` + `RolesGuard` in `src/auth/` — apply guards per-controller as needed.
- JWT payload: `{ sub: userId, role }`.
- Endpoints: `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`.

### Code style

- Prettier: `singleQuote: true`, `trailingComma: "all"`.
- TypeScript: `nodenext` modules, decorators enabled, `strictNullChecks`, `noImplicitAny: false`.

## Domain model

```
Company
  └── Branch
        ├── User (roles: ADMIN | SUPERVISOR | CASHIER)
        ├── Customer (types: REGULAR | SPECIAL)
        └── Inventory (Product × Branch stock)
              └── InventoryMovement (SALE | RETURN | EXCHANGE | BRANCH_TRANSFER | STOCK_IN | STOCK_OUT)

Product ──→ Category

Sale (per Branch, per User)
  ├── SaleDetail (Product × quantity × price)
  ├── SalePayment (CASH | NEQUI | BANCOLOMBIA — multiple per sale)
  └── Loan (if isCredit=true)
        └── LoanPayment
```

`Sale.invoiceNumber` is unique per branch (`@@unique([branchId, invoiceNumber])`). `Inventory` is unique per `[branchId, productId]`.

## Frontend architecture

### Routing and auth

`App.tsx` wraps all routes in `BrowserRouter`. Protected routes render inside `<Layout>` only when `useAuthStore` has a user. On load, `AppInit` calls `auth.init()`, which reads `accessToken` from `localStorage` and validates it via `GET /auth/me`.

Pages: `/login`, `/dashboard`, `/inventario`, `/facturacion`, `/informes`.

### API client (`src/lib/api.ts`)

Thin wrapper around `fetch` with:
- Automatic `Authorization: Bearer` header injection.
- Token refresh on 401: retries original request after calling `POST /auth/refresh` and updating `localStorage`.
- Base URL from `VITE_BASE_URL` env var (defaults to production Render URL in `vite.config.ts`).

### State management

Zustand store at `src/stores/auth.ts` holds `user`, `accessToken`, `loading`, and `error`. Tokens persisted in `localStorage` (not cookies).

### Vite config

- Tailwind CSS v4 via `@tailwindcss/vite` plugin (no `tailwind.config.js` needed).
- PWA via `vite-plugin-pwa` with `autoUpdate` registration. The service worker precaches the app shell only; API calls are `NetworkOnly` (offline data lives in IndexedDB, see below).
- Dev proxy: `/auth` → `http://localhost:3000` (only `/auth` — other routes need `VITE_BASE_URL`).

### TypeScript

Strict: `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `verbatimModuleSyntax`.

## Offline mode (cashier)

The CASHIER can open cash, sell (cash or credit), register loan payments and loan returns without internet for up to 10 hours since the device last reached the server. Closing cash, exchanges, creating customers and sale returns need internet.

**Sale returns** (`backend/src/returns/`, page `/devoluciones` from the Caja screen) are online-only and never go through `/sync`. The cashier scans a barcode; `GET /returns/lookup` lists that product's cash sales (`isCredit=false`, `COMPLETED`) in the branch since Bogotá midnight 7 days ago. Credit sales (loans) are excluded — those go through the loan's own return. `POST /returns` creates a `SaleReturn` tied to the open `CashSession` (required), restocks with a `RETURN` movement, and refunds what was paid for those units. Cash refunds are subtracted from `expectedCash` at close. Sales with returns can't be edited or cancelled, and `POST /sales/:id/cancel` is ADMIN-only. Reports (`reports.service.ts`) are net of returns: each sale has its refunds subtracted (money, units and cost), fully returned sales don't count as sales, and refunds are taken off the sale's own payment methods in proportion.

**Cash close** (`CashService.summary`): "Ventas del día" (`totalSales`) is money received in the shift = `cashReceived + transferReceived`, where the received amounts include sale payments, loan payments (abonos) and special-order payments. Loans made in the shift (`loans`) are informational and never added to sales. `expectedCash = opening + cashReceived − cash refunds`.

## Warranties (garantías)

`backend/src/warranties/`, page `/garantias` (shared by ADMIN and CASHIER, like Traslados). The cashier registers defective merchandise to send back to the supplier as a `WarrantyClaim` (PENDING, stock untouched; quantity can't exceed branch stock minus other pending claims). ADMIN approves → stock goes down with an `InventoryMovement` of type `WARRANTY` (not editable from Inventario) or rejects → nothing moves. Approve/reject use conditional updates so a claim can only be resolved once.

- **Writes** go through `submitOperation()` (`frontend/src/lib/offline/operations.ts`) → `POST /sync`. Online they are sent with `mode: "online"` (normal validations, errors shown to the user). Without a response they are queued in IndexedDB (`queue.ts`) with client-generated UUIDs (op id, `saleId`, `loanId`) and sent later with `mode: "offline"` by the loop in `sync.ts`, in the original order.
- **Backend** (`backend/src/sync/`): each op runs in one transaction reusing `SalesService.createInTx`, `LoansService.addPaymentInTx/returnLoanInTx`, `CashService.openInTx`. `SyncedOperation` makes resends idempotent. In offline mode nothing that already happened is rejected (negative stock, overpayment, loan already closed, no open cash…): it is applied and an `OfflineIssue` is created for the admin (`/revision-offline` page).
- **Reads**: `api.get(url, { offline: true })` saves the response per branch in IndexedDB (`cache.ts`) and falls back to it without network. `overlay.ts` applies queued ops on top so stock/loans/sales look current.
- **Login without internet** (`credentials.ts`): only for cashiers who logged in online on that device in the last 7 days (PBKDF2 hash stored locally). Users who log out with pending ops keep their tokens in `pendingSyncTokens` until their ops are sent.

## Environmental impact (impacto ambiental)

`backend/src/environment/`, page `/impacto-ambiental` (ADMIN and SUPERVISOR, read-only). Sheets of paper avoided = each branch's daily paper use before the app (`DAILY_SHEETS_BY_BRANCH`, from the environmental diagnosis: Aguachica 5, Ocaña 3) × days the branch registered a sale or opened cash since `PILOT_START` (2026-10-01, Bogotá time). The rest of the month is projected as if every remaining day had operation. The endpoint returns the factors (100 sheets per notebook, 500 per ream, 4.75 g CO₂e and $80 per sheet) and the frontend computes the equivalences from them, so the assumptions live only in `environment.service.ts`.

`backend/prisma/demo-octubre.ts` loads fictitious October 2026 sales for the thesis demo (dry run by default, `--apply` writes, `--remove` deletes). What it loads is listed in `backend/prisma/demo-octubre.manifest.json`; `--remove` needs that file.

## Deployment

- Backend: Render (`https://appfacturacion-1.onrender.com`)
- Database: Supabase PostgreSQL
- Frontend: set `VITE_BASE_URL` to the Render backend URL for production builds
