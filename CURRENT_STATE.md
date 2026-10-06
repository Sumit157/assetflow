# Current State

Persistent handoff document between coding agents. Read this before starting work;
update it when a phase or significant feature completes.

- **Last updated:** 2026-10-06
- **Completed phases:** Phase 0 (Foundation), Phase 1 (Authentication and tenancy), Phase 2 (Assets)
- **Next phase:** Phase 3 — Inventory (`docs/ROADMAP.md`)

## How to run and verify

```bash
pnpm install            # if dev scripts fail with "'vite' is not recognized", run this first
pnpm infra:up           # mongo 127.0.0.1:27018, redis 127.0.0.1:6379
pnpm dev                # API :4000 + web :5175 (Vite proxies /api -> API; cookies same-origin)
pnpm typecheck && pnpm lint && pnpm format:check
pnpm test               # shared (16) + api (120) + web (53) = 189 tests; needs infra:up
pnpm docker:up          # full Compose stack (web 5175, api 4000, mongo 27018, redis 6379)
```

Ports are deliberate: web **5175** (another project squats 5173), mongo **27018**
(host mongod owns 27017), api 4000 in both modes. All bound to 127.0.0.1.

## Phase 0 — Foundation (complete)

Monorepo (pnpm workspaces): `apps/api` (Express 5 + TS ESM/NodeNext), `apps/web`
(React + TS + Vite), `packages/{types,shared,config}`. ESLint 9 flat config, Prettier,
Docker Compose (mongo/redis/api/web), health endpoints, response/error envelope,
test infra (Vitest everywhere, `fileParallelism: false` in api).

## Phase 1 — Authentication and tenancy (complete)

### Backend

- **Auth:** register (user+org+ORG_ADMIN transaction), login, logout, refresh
  (rotating opaque token in `af_refresh` HTTP-only cookie, path `/api/v1/auth`,
  30-day sliding; replay ⇒ family revocation + `token_reuse` audit), forgot/reset
  password (1 h single-use hashed tokens; reset revokes all sessions), verify/resend
  email (24 h single-use tokens), `GET /auth/me`, `POST /auth/switch-org`,
  session list/revoke (`GET/DELETE /auth/sessions[/:id]`).
- **Access tokens:** HS256 JWT, 15 min, claims `sub/sid/orgId/role`, memory-only on
  the client. `JWT_SECRET` required (>=32 chars) in production; test env supplies it.
- **Passwords:** scrypt N=32768 r=8 p=1, 64-byte key, 16-byte salt,
  `timingSafeEqual`; min length 10 (`packages/shared/src/auth-rules.ts`).
- **Tenancy:** `requireActiveOrganisation` — org-scoped `:id` must equal the JWT
  `orgId` claim (403 otherwise). Removing a member revokes their sessions whose
  active organisation is that org. Cross-tenant tests exist
  (`src/services/tenant-isolation.test.ts`).
- **RBAC:** `packages/shared/src/rbac.ts` — 18 permissions, roles
  ORG_ADMIN/MANAGER/INVENTORY_MANAGER/ASSET_MANAGER/EMPLOYEE/VIEWER;
  `SUPER_ADMIN` reserved and unassignable; `requirePermission` middleware; last-admin
  invariant → 409; self role-change/removal → 403; users can belong to multiple orgs.
- **Invitations:** create/list/revoke (permission `users.manage`), public
  `GET /invitations/:token` preview (200 with status, only unknown ⇒ 400),
  `POST /invitations/accept` (email match; 403 mismatch, 409 expired; idempotent
  for accepted).
- **Rate limiting:** global (`RATE_LIMIT_MAX`) + stricter auth budget
  (`AUTH_RATE_LIMIT_MAX`); health endpoints exempt. Middleware test included.
- **Email:** transport interface with `log` transport (emails visible in API logs,
  links use `WEB_URL=http://localhost:5175`). BullMQ queueing is **Phase 6**.
- **Audit:** append-only `AuditLog` for all auth/org/member/invitation actions.

### Frontend

- Zustand auth store: single-flight boot (`bootPromise`), `resetAuthStore()` must
  also call `resetAuthClient()` (resets shared refresh promise in `lib/api.ts`).
- `lib/api.ts`: Bearer injection, 401 ⇒ single-flight refresh ⇒ retry once,
  `configureAuth` bridge, `resetAuthClient()`, relative URLs (Vite proxy ⇒
  same-origin cookies, no CORS in dev).
- Routes: unauthenticated (login, register, forgot/reset password, verify-email,
  invitation preview/accept) and authenticated shell (`AppShell` with nav, org
  switcher, user menu, theme toggle): Overview, Organisation (rename behind
  `settings.manage`), Members (invite/role/remove behind `users.manage`, 2-step
  remove), Account (profile, active sessions revoke), NotFound.
- `RequireAuth` / `RequirePermission` guards (UX only — API re-checks);
  `AuthBoot` splash `data-testid="boot-splash"`; verify-email banner + resend.
- Forms: React Hook Form + Zod via hand-rolled `lib/form-resolver.ts`
  (no `@hookform/resolvers` dependency).
- Tests: 39 web tests (route guards, login page, api client refresh semantics,
  auth store, App boot/sign-out/theme, HealthPanel).

## Phase 2 — Assets (complete)

### Backend

- **Models:** `AssetCategory`, `Location` (flat, `code` optional, unique name per org),
  `Asset`, `AssetAssignment`, `AssetTransfer` (`immutable: true` on the last two;
  closed by `returnedAt`). Asset fields: name, assetTag (unique/org), barcode
  (unique/org, generated equal to `assetTag` at creation and frozen), description,
  categoryId, locationId, serialNumber (partial unique on `$type:'string'`),
  condition `good|fair|poor`, status `available|assigned|retired`,
  assignedToUserId (+ hydrated `assignedToName`), retiredAt, retirementReason.
  Money/purchase fields deliberately deferred (not in Phase 2 roadmap).
- **Indexes:** 7 on assets (unique org+tag, org+barcode, partial org+serial, plus
  status/category/location/assignee list indexes), unique org+name on categories and
  locations, unique org+serial on assignments/transfers (append-only).
- **Endpoints** (full contract in `docs/API.md`): `/asset-categories` (GET=assets.view,
  POST=assets.create, PATCH=assets.update, DELETE=assets.delete, 409 when in use),
  `/locations` (same matrix), `/assets` CRUD + `GET /:id/history` +
  `POST /:id/{assign,return,transfer,retire}` (assign/return=assets.assign,
  transfer=assets.transfer, retire=assets.update). DELETE on an asset with any
  assignment/transfer history → 409 "retire instead". Org id comes from the JWT claim —
  no org in path; foreign/malformed ids → 404 via `requireObjectId`/`requireOrgId`.
- **Lifecycle rules (service layer):** status changes via `findOneAndUpdate` CAS +
  ordered history writes with best-effort revert (standalone mongo — no transactions);
  assign target must be an org member (409); transfer requires status `assigned`,
  `toUserId` ≠ current assignee; retire only from `available`; return may update
  condition. Assignment rows are append-only: closing sets returnedAt/returnedByName/
  returnCondition once; transfers close the open row and open a new one — historical
  assignedTo/assignedAt/actors never rewritten.
- **List query:** page/limit(1-100)/q(escaped regex over name|tag|serial|barcode)/
  status/categoryId/locationId/assignedTo/sortBy{createdAt,name,assetTag}/sortDir,
  validated by new `validateQuery` middleware writing `req.validatedQuery`
  (Express 5 `req.query` is read-only). Responses: `Paginated<AssetPublic>`
  `{items,page,limit,total,totalPages}` with read-time hydration of category/location/
  assignee names (batched maps).
- **Audit:** `AuditAction` extended with `asset_category.*`, `location.*`, `asset.*`
  (created/updated/deleted/assigned/returned/transferred/retired). Reuses existing
  error codes (VALIDATION_ERROR/NOT_FOUND/CONFLICT/FORBIDDEN) — no new codes.

### Frontend

- `features/assets/api.ts`: TanStack hooks for asset list/detail/history, create/update/
  delete, assign/return/transfer/retire, categories and locations CRUD. Query keys are
  org-scoped (`['assets', orgId, params]` etc.) so an org switch never shows another
  tenant's cache; mutations invalidate list+detail+history+taxonomy keys.
- Pages: `assets-page` (search with 300 ms debounce, status/category/location filters,
  pagination, empty/error states), `asset-form-page` (create + edit behind
  assets.create/assets.update), `asset-detail-page` (details, QR via `qrcode.react`
  rendering the frozen barcode, lifecycle action forms gated by permission + status,
  merged assignment/transfer history timeline, 2-step delete), `asset-categories-page`
  and `locations-page` (create/edit/delete with inline forms and 409 error surfacing).
- Nav: "Assets" added to `AppShell`; routes `/app/assets`, `/assets/new`,
  `/assets/categories`, `/assets/locations`, `/assets/:id`, `/assets/:id/edit`.
  `RequirePermission` wraps pages (`assets.view` / `assets.create` / `assets.update`);
  inline buttons use `hasPermission` (viewers see read-only UI — API re-checks anyway).
- QR decision: no server render endpoint — `barcode` string is the QR payload
  (client-rendered), scanning = search box. Dependency added: `qrcode.react`.

## Verification status (2026-10-06, Phase 2 exit)

- `pnpm typecheck` ✓ · `pnpm lint` ✓ · `pnpm format:check` ✓
- `pnpm test` ✓ — shared 16 + api 120 + web 53 = **189 passing**
  (api: 35 new asset/taxonomy/lifecycle tests; web: 14 new asset page tests)
- `pnpm --filter @assetflow/web build` ✓ (chunk-size warning only, 569 kB main chunk)
- Local dev E2E through proxy (`localhost:5175/api/v1`): register → create category →
  create location → create asset (barcode=tag, hydrated names) → assign → open history
  row → filtered list search ✓; `GET /health/live` ✓
- Docs updated: `docs/API.md` (full Phase 2 contract: categories, locations, CRUD,
  lifecycle, history)
- Phase 1 exit (2026-10-03) had additionally verified: full Docker Compose E2E
  (register/invite/accept/switch-org/cross-tenant 403/RBAC 403, log-transport email
  links), `docs/SECURITY.md` + `docs/ARCHITECTURE.md` + `README.md` updates — all
  still valid; 140 tests then, 189 now.

## Known issues and technical debt

1. **Compose api image install anomaly:** the first two image builds produced a
   container where `apps/api/node_modules` lacked Phase 1 deps
   (`jsonwebtoken`) despite correct manifests/lockfile in the image; a third
   `--no-cache` build came out clean and was verified. Root cause not fully
   proven (suspect stale BuildKit install layer). If compose api crashes with
   `ERR_MODULE_NOT_FOUND`, rebuild: `docker compose build --no-cache api`.
2. **Host pnpm bin shims vanished once** (`apps/web/node_modules/.bin/vite.cmd`
   disappeared; dev server failed with "'vite' is not recognized"). Fix: run
   `pnpm install` (recreates shims, 5 s, "Already up to date").
3. **Slow tests on this machine (root-caused, mitigated):** api `beforeAll` hooks kept
   timing out because every test file drops `assetflow_test`, forcing mongoose
   `autoIndex` to rebuild ~30 indexes; on Docker-Desktop MongoDB each `createIndex`
   command costs hundreds of ms and the storm (15-30 s) blocks the first write.
   Phase 2 added 5 models (+15 indexes), pushing hooks past the old 20 s limit.
   Mitigated: `testTimeout`/`hookTimeout` now **60 s** in `apps/api/vitest.config.ts`
   (full api suite ≈ 4.5 min). Do not lower without a different strategy (e.g.
   shared non-dropped DB with unique data prefixes).
4. **No git commits yet** — repo initialised but never committed; commit only
   when explicitly asked.
5. **Background dev servers** are launched via helper cmd files in
   `C:\Users\diksh\AppData\Local\Temp\opencode\` (`start-api.cmd`,
   `start-web.cmd`, logs `assetflow-api.log` / `assetflow-web.log`), started with
   `Start-Process cmd.exe /c ... -WindowStyle Hidden`. If a server wedges, kill
   its full process chain (find via `Get-CimInstance Win32_Process` filtered on
   the start-*.cmd root) **scoped strictly to this project**, then relaunch.
   Orphaned `tsx watch` children can hold the log file open and silently block
   new launches (log not truncating is the symptom).
6. Web main chunk is 569 kB (>500 kB warning) — code-split before Phase 8.
7. `permissionsForRole(role)` still returns `undefined` for unknown roles
   (only `hasPermission` was hardened this phase).
8. **Web vitest cache wedge:** adding `qrcode.react` invalidated
   `apps/web/node_modules/.vite`; vitest then failed every worker with
   "Failed to start forks worker / Timeout waiting for worker to respond".
   Fix: delete `apps/web/node_modules/.vite` (workers boot again; jsdom cold boot
   on this machine is ~60 s — the stale cache pushed it over the pool timeout).
   Symptom first, not a code bug — check the cache before debugging test files.

## Architectural decisions (Phase 1)

- Memory-only access token + httpOnly cookie refresh (no localStorage).
- Refresh tokens stored hashed; rotation with family (`sid`) reuse detection.
- Same-origin strategy via dev proxy (`API_PROXY_TARGET`), not CORS; compose web
  sets `API_PROXY_TARGET: http://api:4000`.
- Email behind a transport interface now; BullMQ worker scheduled for Phase 6 —
  do not couple services to BullMQ before then.
- `MemberPublic` DTO in `packages/types`; password rules centralized in
  `packages/shared/src/auth-rules.ts` (API and Zod schemas share them).
- Web router/store created inside `App.tsx` (`useState` initializers) so tests
  get a fresh instance per mount; `main.tsx` has no providers.
- Invitation preview returns 200 with `status` for revoked/expired links
  (400 only for unknown tokens).

## Architectural decisions (Phase 2)

- Asset endpoints are **org-claim scoped** (no org id in the path) — the JWT `orgId`
  claim is the single tenant boundary; `requireOrgId` (services/org-context.ts)
  throws 403 ORGANISATION_REQUIRED when absent.
- History immutability: `AssetAssignment`/`AssetTransfer` schemas use
  `immutable: true`; closure fields (returnedAt/returnedByName/returnCondition) are
  written once. CAS on `status` + best-effort revert instead of transactions
  (standalone mongo; document if ever moving to replica set — then use sessions).
- Barcode = assetTag generated at creation, never rewritten — it is the QR payload;
  no server-side QR endpoint (keeps API surface small, QR rendered client-side with
  `qrcode.react`).
- Read-time hydration (category/location/assignee names) instead of storing
  denormalised names; assignment rows keep their historical names immutable.
- `validateQuery` middleware added (Express 5 makes `req.query` read-only);
  validated payload lands on `req.validatedQuery`.
- Categories/locations DELETE return 409 when in use — matches the roadmap's
  "retire instead of delete" philosophy and keeps referential sanity without
  cascade rules.
- Web query keys include `orgId` even though endpoints are claim-scoped — prevents
  cross-tenant cache bleed after `switch-org` (no global query reset exists yet).

## Next steps — Phase 3 (Inventory)

1. Read `docs/ROADMAP.md` Phase 3 (products, categories, warehouses, locations,
   stock levels, stock adjustments, stock ledger, transfers, low-stock alerts) and
   the relevant sections of `docs/DATABASE.md` (Product, Warehouse, InventoryItem,
   StockMovement, StockTransfer — especially **Stock integrity**), `docs/API.md`
   (Inventory section), `docs/UI.md`, `docs/SECURITY.md`.
2. Inspect existing implementation: Phase 2 patterns to reuse — claim-scoped
   endpoints + `requireOrgId`, `validateQuery`, CAS + immutable-append history
   (the stock ledger mirrors asset history), org-scoped query keys on the web.
3. Every quantity change MUST create an immutable `StockMovement`
   (docs/DATABASE.md "Never modify stock without creating a stock movement");
   decide up front whether adjustments need multi-doc atomicity — if yes, this is
   the phase where transactions/replica-set requirements must be re-evaluated.
4. Vertical slice suggestion: products + categories → warehouses/locations →
   stock levels + adjustments with ledger → transfers → low-stock alerts → tests
   (service, route, permission, tenant isolation) + docs.
5. Run `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test` before
   finishing; update this file and the docs if behaviour changes.
