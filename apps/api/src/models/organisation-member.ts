import { Schema, model, type InferSchemaType, type Types } from 'mongoose';
import { ASSIGNABLE_ROLES } from '@assetflow/shared';

const organisationMemberSchema = new Schema(
  {
    organisationId: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: [...ASSIGNABLE_ROLES], required: true },
  },
  { timestamps: true },
);

organisationMemberSchema.index({ organisationId: 1, userId: 1 }, { unique: true });
organisationMemberSchema.index({ userId: 1 });

export type OrganisationMemberDocument = InferSchemaType<typeof organisationMemberSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const OrganisationMember = model<OrganisationMemberDocument>(
  'OrganisationMember',
  organisationMemberSchema,
);
