# Product Specification

## Product

A multi-tenant Asset + Inventory Management System for small and medium-sized organisations.

Working name: AssetFlow.

## Problem

Companies often track laptops, equipment, stock, suppliers, purchases, maintenance and employee assignments across spreadsheets, paper records and disconnected tools.

AssetFlow provides one place to manage the complete lifecycle.

## Core modules

### Organisation and users

- Organisations
- Members
- Invitations
- Departments
- Employees
- Roles
- Permissions

### Assets

- Asset register
- Asset categories
- Asset tags
- Serial numbers
- QR/barcodes
- Assignment
- Transfers
- Locations
- Departments
- Condition
- Maintenance
- Warranty
- Documents
- Lifecycle
- History

### Inventory

- Products
- SKUs
- Categories
- Brands
- Variants
- Batches
- Serialised inventory
- Warehouses
- Zones/racks/shelves/bins
- Stock levels
- Reorder points
- Stock adjustments
- Stock movements
- Transfers

### Purchasing

- Suppliers
- Purchase orders
- Approval workflow
- Goods receiving
- Partial receiving
- Supplier history

### Maintenance

- Maintenance schedules
- Repair tickets
- Service history
- Costs
- Vendors
- Attachments

### Reporting

- Asset register
- Asset allocation
- Warranty expiry
- Maintenance cost
- Inventory valuation
- Stock movement
- Low stock
- Dead stock
- Purchasing
- Supplier spending

### Platform

- Notifications
- Audit log
- Global search
- CSV import/export
- PDF reports/documents where appropriate
- Dashboard
- Settings

## Roles

- SUPER_ADMIN
- ORG_ADMIN
- MANAGER
- INVENTORY_MANAGER
- ASSET_MANAGER
- EMPLOYEE
- VIEWER

Permissions must be granular.

Examples:

- assets.view
- assets.create
- assets.update
- assets.delete
- assets.assign
- assets.transfer
- assets.maintenance
- inventory.view
- inventory.create
- inventory.adjust
- inventory.transfer
- purchases.view
- purchases.create
- purchases.approve
- reports.view
- users.manage
- settings.manage
- audit.view

## Critical workflows

### Asset lifecycle

Create → available → assign → transfer/maintain → return → retire/dispose.

### Purchase lifecycle

Draft → approval → approved → ordered → partially received/received → closed.

### Stock lifecycle

Opening balance/purchase → warehouse stock → transfer/adjust/consume/return → immutable movement history.

### Employee offboarding

Identify all assigned assets → return/transfer each asset → record final state → complete offboarding.

## MVP priority

Phase 1 product scope:

1. Authentication
2. Organisation/members
3. RBAC
4. Dashboard
5. Assets
6. Employees
7. Inventory/products
8. Warehouses
9. Stock movements
10. Suppliers
11. Purchase orders
12. Goods receiving
13. QR/barcodes
14. Audit log
15. Notifications
16. Basic reports

Advanced forecasting, depreciation, external integrations and complex automation should come after the core product is stable.
