# AssetFlow — Agent Development Instructions

Before starting any task, read `CURRENT_STATE.md`. Before finishing a phase, update `CURRENT_STATE.md`.

## Mission

Build a production-ready multi-tenant Asset + Inventory Management System using the MERN stack.

This is a real product, not a demo or basic CRUD university project.

## Core stack

- Frontend: React + TypeScript + Vite
- Backend: Node.js + Express + TypeScript
- Database: MongoDB + Mongoose
- State/server data: TanStack Query
- Client state: Zustand only where necessary
- UI: Tailwind CSS + shadcn/ui
- Forms: React Hook Form + Zod
- Charts: Recharts
- Cache/queues: Redis + BullMQ
- Auth: short-lived access tokens + secure refresh-token strategy
- Storage: S3-compatible object storage abstraction
- Testing: Vitest/Jest + Supertest + React Testing Library
- Containers: Docker + Docker Compose
- CI: GitHub Actions

## Non-negotiable rules

1. Read `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/API.md`, `docs/UI.md`, `docs/SECURITY.md`, and `docs/ROADMAP.md` before implementing.
2. Do not implement fake functionality.
3. Do not leave placeholder buttons, dead routes, TODO-only screens or mocked production flows.
4. Business logic belongs in services/use-cases, not route handlers or React components.
5. Every tenant-scoped query must enforce organisation isolation.
6. Every inventory quantity change must create an immutable stock movement.
7. Historical asset assignments/transfers must never be overwritten.
8. Use validation at API boundaries.
9. Never expose secrets or sensitive authentication data.
10. Prefer small, cohesive modules over giant files.
11. Do not add dependencies unless there is a clear reason.
12. Run typecheck, lint and relevant tests after meaningful changes.
13. Fix regressions before moving to the next phase.
14. Keep documentation updated when architecture or behaviour changes.
15. Do not redesign the architecture casually. Update the relevant docs first if a change is necessary.

## Mandatory Project State Tracking

`CURRENT_STATE.md` is the persistent handoff document between coding agents and development sessions.

The agent MUST maintain it throughout the entire project.

### After every phase

When a development phase is completed:

1. Inspect the actual repository and verify what was implemented.
2. Run the relevant verification checks.
3. Update `CURRENT_STATE.md`.
4. Record the completed phase.
5. Record any incomplete requirements.
6. Record known issues and technical debt.
7. Record important architectural decisions made during the phase.
8. Record verification results.
9. Set the next phase.
10. Add concrete next steps for the next agent.

Do NOT claim a feature or verification passed unless it has actually been checked.

### After significant feature work

For substantial features that do not constitute an entire phase, update `CURRENT_STATE.md` when the work changes the project's architecture, current implementation state, known issues, or next steps.

### Before starting a new phase

The agent MUST:

1. Read `CURRENT_STATE.md`.
2. Read the relevant phase in `docs/ROADMAP.md`.
3. Inspect the existing implementation.
4. Confirm which requirements from the previous phase are actually complete.
5. Continue from the existing implementation rather than rebuilding completed work.

### Phase completion requirement

A phase is NOT considered complete until:

- Implementation is complete.
- Relevant tests/checks have been run.
- Known issues are documented.
- `CURRENT_STATE.md` has been updated.
- Documentation has been updated if architecture or behaviour changed.

### Agent handoff

`CURRENT_STATE.md` must always leave the repository in a state where another coding agent can continue the project without needing access to the previous agent's conversation history.

Never rely on conversation history as project memory.

The repository itself must contain enough context to continue development.

## Product priorities

Prioritise:

- Fast common workflows
- Clear information hierarchy
- Data integrity
- Security
- Tenant isolation
- Auditability
- Good mobile behaviour
- Maintainability

Avoid feature bloat.

## Working method

Before coding a feature:

1. Read the relevant specification.
2. Inspect the existing implementation.
3. Identify affected modules.
4. Implement the smallest complete vertical slice.
5. Add validation and error handling.
6. Add/update tests.
7. Run checks.
8. Update documentation if needed.

When requirements are ambiguous, choose the simplest commercially sensible interpretation and document the decision.

## Definition of done

A feature is done only when:

- UI exists
- API exists where needed
- database behaviour is implemented
- permissions are enforced
- loading/empty/error states exist
- validation exists
- relevant tests exist
- no TypeScript errors remain
- no obvious security issue remains
- documentation is accurate
