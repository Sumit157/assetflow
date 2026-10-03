# System Architecture

## Repository

Use a monorepo:

```text
/
├── apps/
│   ├── web/
│   └── api/
├── packages/
│   ├── shared/
│   ├── config/
│   └── types/
├── infrastructure/
├── docs/
└── AGENTS.md
```

## Frontend architecture

```text
pages/routes
  ↓
feature components
  ↓
hooks/query layer
  ↓
API client
```

Organise frontend code by feature where practical.

Avoid one giant `components/` directory containing all business logic.

## Backend architecture

```text
HTTP route
  ↓
middleware
  ↓
controller
  ↓
service/use-case
  ↓
repository/data access
  ↓
Mongoose model
  ↓
MongoDB
```

Controllers remain thin.

Services contain business rules.

Repositories/data-access modules isolate persistence concerns where useful.

## Cross-cutting backend modules

- authentication
- authorisation
- validation
- error handling
- logging
- rate limiting
- tenant context
- audit logging
- file storage
- notifications
- jobs

## Tenant isolation

Every organisation-owned entity must include `organisationId`.

Every read, update and delete must scope by the authenticated organisation.

Never trust an organisation ID supplied by the client.

Resolve tenant context from the authenticated membership/session.

Add automated tests specifically for cross-tenant access attempts.

## Async architecture

Use Redis + BullMQ for:

- emails
- CSV imports
- report generation
- warranty reminders
- maintenance reminders
- low-stock notifications

Jobs must be idempotent.

**Current state (Phase 1):** emails (invitations, password reset, verification) are sent
through a transport interface with a synchronous `log` transport — nothing is enqueued
yet. The interface is the seam where the BullMQ email worker lands (Phase 6) without
touching services. Redis and BullMQ are already provisioned in Compose.

## Storage

Use an object-storage abstraction for documents/images.

Do not store large binary files directly in MongoDB.

## API

Version the API:

`/api/v1/...`

Use consistent response/error structures.

Same-origin strategy: the browser never talks to `:4000` cross-origin.

- **Local dev** — Vite proxies `/api/*` (and the auth cookie path) to the API:
  target = `API_PROXY_TARGET` (default `http://localhost:4000`). This keeps
  `localhost` cookies same-origin and avoids CORS entirely; `CORS_ORIGINS` exists only
  as a fallback for direct-API access (e.g. `http://localhost:5175`).
- **Docker/production** — the web container proxies to `http://api:4000`
  (`API_PROXY_TARGET` set in `docker-compose.yml`). In production the same arrangement
  terminates at the reverse proxy.

The web API client sends relative URLs (`/api/v1/...`); set `VITE_API_BASE_URL` only
when the API is genuinely on another origin.

## Deployment target

The system must be Docker-friendly and AWS-ready.

Local:

- web
- api
- MongoDB
- Redis

Production should support separate scalable web/API services and managed database/cache/storage services.
