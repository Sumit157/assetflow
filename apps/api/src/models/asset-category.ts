import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

const assetCategorySchema = new Schema(
  {
    organisationId: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: null, maxlength: 500 },
  },
  { timestamps: true },
);

assetCategorySchema.index({ organisationId: 1, name: 1 }, { unique: true });

export type AssetCategoryDocument = InferSchemaType<typeof assetCategorySchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const AssetCategory = model<AssetCategoryDocument>('AssetCategory', assetCategorySchema);
