import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import type { AssetCondition } from '@assetflow/types';

const assetAssignmentSchema = new Schema(
  {
    organisationId: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true },
    assetId: { type: Schema.Types.ObjectId, ref: 'Asset', required: true },
    assignedToUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    assignedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    assignedAt: { type: Date, required: true, default: Date.now, immutable: true },
    returnedAt: { type: Date, default: null },
    returnedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    returnCondition: { type: String, enum: ['good', 'fair', 'poor'], default: null },
    notes: { type: String, default: null, maxlength: 1000 },
  },
  { timestamps: true },
);

assetAssignmentSchema.index({ organisationId: 1, assetId: 1, assignedAt: -1 });
assetAssignmentSchema.index(
  { organisationId: 1, assetId: 1 },
  { partialFilterExpression: { returnedAt: null } },
);

export type AssetAssignmentDocument = InferSchemaType<typeof assetAssignmentSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  assignedAt: Date;
  returnedAt: Date | null;
  returnCondition: AssetCondition | null;
};

export const AssetAssignment = model<AssetAssignmentDocument>(
  'AssetAssignment',
  assetAssignmentSchema,
);
