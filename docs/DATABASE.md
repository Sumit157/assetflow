# Database Specification

Use MongoDB with Mongoose.

## Core collections

- User
- Organisation
- OrganisationMember
- Invitation
- Role
- Permission
- Department
- Employee
- Location
- Asset
- AssetCategory
- AssetAssignment
- AssetTransfer
- AssetMaintenance
- Product
- ProductCategory
- Warehouse
- WarehouseLocation
- InventoryItem
- StockMovement
- StockTransfer
- Supplier
- PurchaseOrder
- PurchaseOrderItem
- GoodsReceipt
- GoodsReceiptItem
- Notification
- AuditLog
- Document

## General rules

Every tenant-owned document should contain:

- organisationId
- createdAt
- updatedAt

Use references for large relationships.

Do not create unbounded arrays.

Use immutable records for:

- stock movements
- asset transfers
- asset assignment history
- audit logs

## Important indexes

Consider indexes for:

- organisationId
- organisationId + assetTag
- organisationId + serialNumber
- organisationId + sku
- organisationId + barcode
- organisationId + status
- organisationId + createdAt
- organisationId + updatedAt

Use compound indexes based on actual query patterns.

## Stock integrity

Never modify stock without creating a stock movement.

A stock adjustment must record:

- organisation
- product/inventory item
- warehouse/location
- previous quantity
- delta
- resulting quantity
- movement type
- reason
- actor
- timestamp
- related document/reference

Use transactions for operations that must update multiple records atomically.

## Asset history

Never overwrite historical assignment or transfer records.

Current assignment is a current-state representation. History remains immutable.
