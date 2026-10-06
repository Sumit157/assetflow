import { Types } from 'mongoose';
import type { AssetCategoryPublic } from '@assetflow/types';
import { ERROR_CODES } from '@assetflow/shared';
import { HttpError } from '../lib/http-error.js';
import { Asset } from '../models/asset.js';
import { AssetCategory } from '../models/asset-category.js';
import type { AuthContext } from '../types/auth-context.js';
import type { AuditService } from './audit-service.js';
import { requireOrgId } from './org-context.js';

export interface AssetCategoryServiceDeps {
  audit: AuditService;
}

export interface AssetCategoryInput {
  name: string;
  description?: string | null;
}

export interface AssetCategoryService {
  list(claims: AuthContext): Promise<AssetCategoryPublic[]>;
  create(
    claims: AuthContext,
    input: AssetCategoryInput,
    ip: string | null,
  ): Promise<AssetCategoryPublic>;
  update(
    claims: AuthContext,
    categoryId: string,
    input: AssetCategoryInput,
    ip: string | null,
  ): Promise<AssetCategoryPublic>;
  remove(claims: AuthContext, categoryId: string, ip: string | null): Promise<void>;
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  );
}

export function createAssetCategoryService(deps: AssetCategoryServiceDeps): AssetCategoryService {
  async function assetCounts(orgId: string): Promise<Map<string, number>> {
    const rows = await Asset.aggregate<{ _id: Types.ObjectId | null; count: number }>([
      { $match: { organisationId: new Types.ObjectId(orgId) } },
      { $group: { _id: '$categoryId', count: { $sum: 1 } } },
    ]).exec();
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (row._id) counts.set(String(row._id), row.count);
    }
    return counts;
  }

  async function toPublic(
    orgId: string,
    doc: {
      _id: unknown;
      organisationId: unknown;
      name: string;
      description?: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
  ): Promise<AssetCategoryPublic> {
    const counts = await assetCounts(orgId);
    return {
      id: String(doc._id),
      organisationId: String(doc.organisationId),
      name: doc.name,
      description: doc.description ?? null,
      assetCount: counts.get(String(doc._id)) ?? 0,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }

  async function assertNameFree(orgId: string, name: string, excludeId?: string): Promise<void> {
    const existing = await AssetCategory.findOne({
      organisationId: orgId,
      name,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    })
      .select('_id')
      .lean()
      .exec();
    if (existing) {
      throw new HttpError(409, ERROR_CODES.CONFLICT, `A category named "${name}" already exists.`);
    }
  }

  return {
    async list(claims) {
      const orgId = requireOrgId(claims);
      const docs = await AssetCategory.find({ organisationId: orgId })
        .sort({ name: 1 })
        .lean()
        .exec();
      const counts = await assetCounts(orgId);
      return docs.map((doc) => ({
        id: String(doc._id),
        organisationId: String(doc.organisationId),
        name: doc.name,
        description: doc.description ?? null,
        assetCount: counts.get(String(doc._id)) ?? 0,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
      }));
    },

    async create(claims, input, ip) {
      const orgId = requireOrgId(claims);
      const name = input.name.trim();
      await assertNameFree(orgId, name);

      let doc;
      try {
        doc = await AssetCategory.create({
          organisationId: orgId,
          name,
          description: input.description?.trim() || null,
        });
      } catch (error) {
        if (isDuplicateKey(error)) {
          throw new HttpError(
            409,
            ERROR_CODES.CONFLICT,
            `A category named "${name}" already exists.`,
          );
        }
        throw error;
      }

      await deps.audit.record({
        organisationId: orgId,
        userId: claims.userId,
        action: 'asset_category.created',
        targetType: 'asset_category',
        targetId: String(doc._id),
        metadata: { name },
        ip,
      });

      return toPublic(orgId, doc);
    },

    async update(claims, categoryId, input, ip) {
      const orgId = requireOrgId(claims);
      const doc = await AssetCategory.findOne({ _id: categoryId, organisationId: orgId }).exec();
      if (!doc) throw new HttpError(404, ERROR_CODES.NOT_FOUND, 'Category not found.');

      const name = input.name.trim();
      await assertNameFree(orgId, name, categoryId);

      doc.name = name;
      doc.description = input.description?.trim() || null;
      try {
        await doc.save();
      } catch (error) {
        if (isDuplicateKey(error)) {
          throw new HttpError(
            409,
            ERROR_CODES.CONFLICT,
            `A category named "${name}" already exists.`,
          );
        }
        throw error;
      }

      await deps.audit.record({
        organisationId: orgId,
        userId: claims.userId,
        action: 'asset_category.updated',
        targetType: 'asset_category',
        targetId: categoryId,
        metadata: { name },
        ip,
      });

      return toPublic(orgId, doc);
    },

    async remove(claims, categoryId, ip) {
      const orgId = requireOrgId(claims);
      const doc = await AssetCategory.findOne({ _id: categoryId, organisationId: orgId })
        .select('_id name')
        .lean()
        .exec();
      if (!doc) throw new HttpError(404, ERROR_CODES.NOT_FOUND, 'Category not found.');

      const inUse = await Asset.countDocuments({
        organisationId: orgId,
        categoryId: doc._id,
      }).exec();
      if (inUse > 0) {
        throw new HttpError(
          409,
          ERROR_CODES.CONFLICT,
          `This category is used by ${inUse} asset${inUse === 1 ? '' : 's'}. Reassign those assets first.`,
        );
      }

      await AssetCategory.deleteOne({ _id: doc._id }).exec();

      await deps.audit.record({
        organisationId: orgId,
        userId: claims.userId,
        action: 'asset_category.deleted',
        targetType: 'asset_category',
        targetId: categoryId,
        metadata: { name: doc.name },
        ip,
      });
    },
  };
}
