import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { ASSIGNABLE_ROLES } from '@assetflow/shared';

const invitationSchema = new Schema(
  {
    organisationId: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: [...ASSIGNABLE_ROLES], required: true },
    tokenHash: { type: String, required: true, unique: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    status: { type: String, enum: ['pending', 'accepted', 'revoked'], default: 'pending' },
    acceptedAt: { type: Date, default: null },
    acceptedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

invitationSchema.index({ organisationId: 1, status: 1 });
invitationSchema.index({ organisationId: 1, email: 1, status: 1 });

export type InvitationDocument = InferSchemaType<typeof invitationSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const Invitation = model<InvitationDocument>('Invitation', invitationSchema);
