import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import type { AssetCondition, AssetStatus } from '@assetflow/types';

const assetSchema = new Schema(
  {
    organisationId: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    assetTag: { type: String, required: true, trim: true, maxlength: 50 },
    barcode: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, default: null, maxlength: 2000 },
    categoryId: { type: Schema.Types.ObjectId, ref: 'AssetCategory', default: null },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location', default: null },
    serialNumber: { type: String, default: null, trim: true, maxlength: 100 },
    condition: { type: String, enum: ['good', 'fair', 'poor'], default: 'good' },
    status: {
      type: String,
      enum: ['available', 'assigned', 'retired'],
      default: 'available',
    },
    assignedToUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    retiredAt: { type: Date, default: null },
    retirementReason: { type: String, default: null, maxlength: 500 },
  },
  { timestamps: true },
);

assetSchema.index({ organisationId: 1, assetTag: 1 }, { unique: true });
assetSchema.index({ organisationId: 1, barcode: 1 }, { unique: true });
assetSchema.index(
  { organisationId: 1, serialNumber: 1 },
  { unique: true, partialFilterExpression: { serialNumber: { $type: 'string' } } },
);
assetSchema.index({ organisationId: 1, status: 1, createdAt: -1 });
assetSchema.index({ organisationId: 1, categoryId: 1 });
assetSchema.index({ organisationId: 1, locationId: 1 });
assetSchema.index({ organisationId: 1, assignedToUserId: 1 });

export type AssetDocument = InferSchemaType<typeof assetSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  condition: AssetCondition;
  status: AssetStatus;
};

export const Asset = model<AssetDocument>('Asset', assetSchema);
