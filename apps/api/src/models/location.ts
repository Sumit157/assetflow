import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

const locationSchema = new Schema(
  {
    organisationId: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    code: { type: String, default: null, trim: true, maxlength: 40 },
  },
  { timestamps: true },
);

locationSchema.index({ organisationId: 1, name: 1 }, { unique: true });

export type LocationDocument = InferSchemaType<typeof locationSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const Location = model<LocationDocument>('Location', locationSchema);
