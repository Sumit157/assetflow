import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

const auditLogSchema = new Schema(
  {
    organisationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organisation',
      default: null,
      immutable: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null, immutable: true },
    action: { type: String, required: true, immutable: true },
    targetType: { type: String, default: null, immutable: true },
    targetId: { type: String, default: null, immutable: true },
    metadata: { type: Schema.Types.Mixed, default: {}, immutable: true },
    ip: { type: String, default: null, maxlength: 64, immutable: true },
  },
  { timestamps: true },
);

auditLogSchema.index({ organisationId: 1, createdAt: -1 });
auditLogSchema.index({ userId: 1, createdAt: -1 });

export type AuditLogDocument = InferSchemaType<typeof auditLogSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const AuditLog = model<AuditLogDocument>('AuditLog', auditLogSchema);
