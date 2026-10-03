import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

const refreshSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    family: { type: String, required: true },
    sessionStartedAt: { type: Date, required: true },
    tokenHash: { type: String, required: true, unique: true },
    activeOrganisationId: { type: Schema.Types.ObjectId, ref: 'Organisation', default: null },
    userAgent: { type: String, default: null, maxlength: 512 },
    ip: { type: String, default: null, maxlength: 64 },
    expiresAt: { type: Date, required: true, expires: 0 },
    rotatedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

refreshSessionSchema.index({ userId: 1, revokedAt: 1, rotatedAt: 1 });
refreshSessionSchema.index({ family: 1 });

export type RefreshSessionDocument = InferSchemaType<typeof refreshSessionSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const RefreshSession = model<RefreshSessionDocument>('RefreshSession', refreshSessionSchema);
