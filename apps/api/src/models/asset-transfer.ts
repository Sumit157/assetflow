import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

const assetTransferSchema = new Schema(
  {
    organisationId: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true },
    assetId: { type: Schema.Types.ObjectId, ref: 'Asset', required: true, immutable: true },
    fromUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null, immutable: true },
    toUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    fromLocationId: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      default: null,
      immutable: true,
    },
    toLocationId: { type: Schema.Types.ObjectId, ref: 'Location', default: null, immutable: true },
    transferredByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    transferredAt: { type: Date, required: true, default: Date.now, immutable: true },
    notes: { type: String, default: null, maxlength: 1000 },
  },
  { timestamps: true },
);

assetTransferSchema.index({ organisationId: 1, assetId: 1, transferredAt: -1 });

export type AssetTransferDocument = InferSchemaType<typeof assetTransferSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  transferredAt: Date;
};

export const AssetTransfer = model<AssetTransferDocument>('AssetTransfer', assetTransferSchema);
