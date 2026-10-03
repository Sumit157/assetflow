import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

const oneTimeTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    purpose: { type: String, enum: ['password_reset', 'email_verify'], required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true },
);

oneTimeTokenSchema.index({ userId: 1, purpose: 1 });

export type OneTimeTokenDocument = InferSchemaType<typeof oneTimeTokenSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const OneTimeToken = model<OneTimeTokenDocument>('OneTimeToken', oneTimeTokenSchema);
