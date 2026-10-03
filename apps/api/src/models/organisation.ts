import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

const organisationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
  },
  { timestamps: true },
);

export type OrganisationDocument = InferSchemaType<typeof organisationSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const Organisation = model<OrganisationDocument>('Organisation', organisationSchema);
