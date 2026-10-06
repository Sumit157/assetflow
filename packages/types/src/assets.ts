export type AssetStatus = 'available' | 'assigned' | 'retired';

export type AssetCondition = 'good' | 'fair' | 'poor';

export interface AssetCategoryPublic {
  id: string;
  organisationId: string;
  name: string;
  description: string | null;
  assetCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface LocationPublic {
  id: string;
  organisationId: string;
  name: string;
  code: string | null;
  assetCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AssetPublic {
  id: string;
  organisationId: string;
  name: string;
  assetTag: string;
  barcode: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  locationId: string | null;
  locationName: string | null;
  serialNumber: string | null;
  condition: AssetCondition;
  status: AssetStatus;
  assignedToUserId: string | null;
  assignedToName: string | null;
  retiredAt: string | null;
  retirementReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetAssignmentPublic {
  id: string;
  assetId: string;
  assetName: string;
  assetTag: string;
  assignedToUserId: string;
  assignedToName: string;
  assignedByName: string;
  assignedAt: string;
  returnedAt: string | null;
  returnedByName: string | null;
  returnCondition: AssetCondition | null;
  notes: string | null;
}

export interface AssetTransferPublic {
  id: string;
  assetId: string;
  assetName: string;
  assetTag: string;
  fromUserId: string | null;
  fromUserName: string | null;
  toUserId: string;
  toUserName: string;
  transferredByName: string;
  transferredAt: string;
  notes: string | null;
}

export interface AssetHistory {
  assignments: AssetAssignmentPublic[];
  transfers: AssetTransferPublic[];
}

export type AssetSortField = 'createdAt' | 'name' | 'assetTag';

export interface AssetListQuery {
  page: number;
  limit: number;
  q?: string;
  status?: AssetStatus;
  categoryId?: string;
  locationId?: string;
  assignedTo?: string;
  sortBy: AssetSortField;
  sortDir: 'asc' | 'desc';
}
