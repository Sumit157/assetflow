# Development Roadmap

Build in vertical slices. Do not attempt to generate the entire application blindly in one pass.

## Phase 0 — Foundation

- repository setup
- monorepo
- TypeScript
- linting
- formatting
- environment configuration
- Docker Compose
- MongoDB
- Redis
- base API
- base web app
- shared packages

Exit criteria:

- web and API run locally
- typecheck passes
- lint passes
- Docker development environment works

## Phase 1 — Authentication and tenancy

- registration
- login
- logout
- refresh
- password reset
- email verification abstraction
- organisations
- members
- invitations
- RBAC
- tenant isolation

Exit criteria:

- users can authenticate
- organisation data is isolated
- permission tests exist

## Phase 2 — Assets

- categories
- asset CRUD
- asset detail
- QR/barcodes
- assignments
- returns
- transfers
- locations
- history

## Phase 3 — Inventory

- products
- categories
- warehouses
- locations
- stock levels
- stock adjustments
- stock ledger
- transfers
- low-stock alerts

## Phase 4 — Purchasing

- suppliers
- purchase orders
- approval workflow
- goods receiving
- partial receiving
- inventory integration

## Phase 5 — Maintenance and warranties

- maintenance records
- schedules
- repairs
- costs
- warranty tracking
- reminders

## Phase 6 — Platform features

- notifications
- audit logs
- global search
- documents
- CSV import/export

## Phase 7 — Reporting

- inventory reports
- asset reports
- purchasing reports
- maintenance reports
- CSV/PDF exports

## Phase 8 — Quality

- performance
- accessibility
- security review
- error handling
- tests
- mobile polish
- empty/loading/error states

## Phase 9 — Deployment

- production Docker builds
- GitHub Actions
- AWS deployment documentation
- health checks
- logging
- backup/recovery documentation

## Phase 10 — Post-MVP

Only after real users validate the core product:

- advanced depreciation
- demand forecasting
- external integrations
- SSO
- advanced automation
- public API
- billing/subscriptions
