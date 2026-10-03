# Current State

Persistent handoff document between coding agents. Read this before starting work;
update it when a phase or significant feature completes.

- **Last updated:** 2026-10-03
- **Completed phases:** Phase 0 (Foundation), Phase 1 (Authentication and tenancy)
- **Next phase:** Phase 2 — Assets (`docs/ROADMAP.md`)

## How to run and verify

```bash
pnpm install            # if dev scripts fail with "'vite' is not recognized", run this first
pnpm infra:up           # mongo 127.0.0.1:27018, redis 127.0.0.1:6379
pnpm dev                # API :4000 + web :5175 (Vite proxies /api -> API; cookies same-origin)
pnpm typecheck && pnpm lint && pnpm format:check
pnpm test               # shared (16) + api (85) + web (39) = 140 tests; needs infra:up
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

## Verification status (2026-10-03, Phase 1 exit)

- `pnpm typecheck` ✓ · `pnpm lint` ✓ · `pnpm format:check` ✓
- `pnpm test` ✓ — shared 16 + api 85 + web 39 = **140 passing**
- `pnpm --filter @assetflow/web build` ✓ (chunk-size warning only, 514 kB main chunk)
- Local dev E2E through proxy (`localhost:5175/api/v1`): register → me → refresh →
  members ✓; SPA fallback `/login` ✓
- Docker Compose E2E (`docker compose up --build`): health, register, invite,
  public preview, invitee register, accept, switch-org, cross-tenant 403,
  member list (2 roles), VIEWER invite attempt 403 ✓; log-transport emails emit
  correct `localhost:5175` links ✓
- Docs updated: `docs/API.md` (full Phase 1 contract), `docs/SECURITY.md`
  (scrypt/JWT/rotation details, role→permission matrix, known tradeoffs),
  `docs/ARCHITECTURE.md` (email deferral, same-origin proxy strategy),
  `README.md` (tests need infra:up, env vars, ports)

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
3. **Cold-Mongo hook timeout:** one full-suite run timed out a 15 s
   `beforeAll` in `invitations.test.ts` right after recreating the mongo
   container. Mitigated: api `testTimeout`/`hookTimeout` raised to 20 s in
   `apps/api/vitest.config.ts`. Watch for recurrence in CI.
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
6. Web main chunk is 514 kB (>500 kB warning) — code-split before Phase 8.
7. `permissionsForRole(role)` still returns `undefined` for unknown roles
   (only `hasPermission` was hardened this phase).

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

## Next steps — Phase 2 (Assets)

1. Read `docs/ROADMAP.md` Phase 2 and the relevant sections of `docs/DATABASE.md`
   (Asset, AssetCategory, AssetAssignment, Location), `docs/API.md` (Assets
   section), `docs/UI.md`, `docs/SECURITY.md`.
2. Inspect existing implementation (auth/tenancy layers are stable — reuse
   `requireActiveOrganisation`, `requirePermission`, audit service, error codes).
3. Vertical slice order suggestion: categories + locations → asset CRUD +
   list/detail UI → assignment/return (immutable history) → transfer → QR/barcode
   (generate + scan UI) → tests (service, route, permission, tenant isolation).
4. Every asset read/update is tenant-scoped; assignment/transfer/return must
   append immutable history rows — never overwrite.
5. Run `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test` before
   finishing; update this file and the docs if behaviour changes.
