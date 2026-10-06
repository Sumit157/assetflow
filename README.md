# AssetFlow

Multi-tenant asset and inventory management system. Monorepo built with the MERN stack.

See `docs/PRODUCT.md` for product requirements, `docs/ROADMAP.md` for the delivery plan,
and `docs/ARCHITECTURE.md` for system design.

## Stack

- **Frontend** (`apps/web`): React + TypeScript + Vite, TanStack Query, Tailwind CSS, React Hook Form + Zod
- **Backend** (`apps/api`): Node.js + Express + TypeScript, MongoDB (Mongoose), Redis
- **Packages**: `packages/types` (shared domain types), `packages/shared` (shared constants/helpers), `packages/config` (shared tooling config)
- **Infra**: Docker Compose (MongoDB 7, Redis 7, API, web)

## Prerequisites

- Node.js 24+ and pnpm 9.11 (pinned via `packageManager`)
- Docker + Docker Compose (for MongoDB/Redis or the full stack)

## Quick start (local development)

```bash
pnpm install
pnpm infra:up        # MongoDB (127.0.0.1:27018) + Redis (127.0.0.1:6379)
pnpm dev             # API (:4000) + web (:5175), watch mode
```

Open http://localhost:5175 â€” the home screen shows live API health status.

Copy `apps/api/.env.example` to `apps/api/.env` if you want to override defaults
(the built-in defaults work with the Compose infrastructure).

Useful overrides: `API_PROXY_TARGET` (web dev proxy target, default
`http://localhost:4000`), `CORS_ORIGINS` (default `http://localhost:5175`),
`VITE_API_BASE_URL` (leave unset to use the proxy â€” cookies stay same-origin).

## Quick start (full Docker stack)

```bash
pnpm docker:up       # builds api + web images, starts mongo/redis/api/web
pnpm docker:down     # stops the stack (data volumes persist)
```

## Scripts

| Script                                | Purpose                                                      |
| ------------------------------------- | ------------------------------------------------------------ |
| `pnpm dev`                            | Run API and web concurrently in watch mode                   |
| `pnpm typecheck`                      | TypeScript checks across all packages                        |
| `pnpm lint`                           | ESLint across all packages                                   |
| `pnpm format` / `pnpm format:check`   | Prettier write / check                                       |
| `pnpm test`                           | Unit and integration tests (Vitest)                          |
| `pnpm build:packages`                 | Build `packages/*` to `dist` (required before building apps) |
| `pnpm infra:up` / `pnpm infra:down`   | Start/stop MongoDB + Redis containers                        |
| `pnpm docker:up` / `pnpm docker:down` | Start/stop the full Compose stack                            |

### Tests

The API integration tests need MongoDB (and readiness Redis) â€” start them first:

```bash
pnpm infra:up     # mongo on 127.0.0.1:27018 (test DB assetflow_test), redis on 6379
pnpm test         # shared (16) + api (120) + web (53) test suites
```

API tests run sequentially (`fileParallelism: false`) against the local MongoDB. Web
tests are pure jsdom unit tests and need no services.

## Ports

| Port  | Service                | Rationale                                                                    |
| ----- | ---------------------- | ---------------------------------------------------------------------------- |
| 4000  | API (local and Docker) | Single stable port for both modes                                            |
| 5175  | Web (local and Docker) | Dedicated port; avoids clashes with other projects on Vite's default 5173    |
| 27018 | MongoDB (host-facing)  | Host already runs a MongoDB on 27017; Compose maps 27018 â†’ container 27017 |
| 6379  | Redis                  | Default port                                                                 |

Ports are bound to `127.0.0.1` only.

## Conventions

- TypeScript everywhere; apps use ESM with NodeNext resolution (relative imports include `.js`).
- API responses follow the `{ data }` / `{ error: { code, message, requestId } }` envelope (see `docs/API.md`).
- Business logic lives in services, not route handlers or React components.
- Every query and mutation is tenant-scoped; every quantity change writes an immutable stock movement.
- Validation happens at the API boundary (Zod).

## Documentation

| Document               | Contents                                                   |
| ---------------------- | ---------------------------------------------------------- |
| `docs/PRODUCT.md`      | Product requirements and scope                             |
| `docs/ARCHITECTURE.md` | System design, module boundaries                           |
| `docs/DATABASE.md`     | Data model                                                 |
| `docs/API.md`          | API contract incl. auth/tenancy endpoints, response format |
| `docs/UI.md`           | UI structure and design system                             |
| `docs/SECURITY.md`     | Auth, RBAC matrix, tenancy, secrets handling               |
| `docs/ROADMAP.md`      | Phased delivery plan                                       |
