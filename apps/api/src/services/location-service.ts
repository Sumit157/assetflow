import { Types } from 'mongoose';
import type { LocationPublic } from '@assetflow/types';
import { ERROR_CODES } from '@assetflow/shared';
import { HttpError } from '../lib/http-error.js';
import { Asset } from '../models/asset.js';
import { Location } from '../models/location.js';
import type { AuthContext } from '../types/auth-context.js';
import type { AuditService } from './audit-service.js';
import { requireOrgId } from './org-context.js';

export interface LocationServiceDeps {
  audit: AuditService;
}

export interface LocationInput {
  name: string;
  code?: string | null;
}

export interface LocationService {
  list(claims: AuthContext): Promise<LocationPublic[]>;
  create(claims: AuthContext, input: LocationInput, ip: string | null): Promise<LocationPublic>;
  update(
    claims: AuthContext,
    locationId: string,
    input: LocationInput,
    ip: string | null,
  ): Promise<LocationPublic>;
  remove(claims: AuthContext, locationId: string, ip: string | null): Promise<void>;
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  );
}

export function createLocationService(deps: LocationServiceDeps): LocationService {
  async function assetCounts(orgId: string): Promise<Map<string, number>> {
    const rows = await Asset.aggregate<{ _id: Types.ObjectId | null; count: number }>([
      { $match: { organisationId: new Types.ObjectId(orgId) } },
      { $group: { _id: '$locationId', count: { $sum: 1 } } },
    ]).exec();
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (row._id) counts.set(String(row._id), row.count);
    }
    return counts;
  }

  function toPublic(
    doc: {
      _id: unknown;
      organisationId: unknown;
      name: string;
      code?: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
    assetCount: number,
  ): LocationPublic {
    return {
      id: String(doc._id),
      organisationId: String(doc.organisationId),
      name: doc.name,
      code: doc.code ?? null,
      assetCount,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }

  async function assertNameFree(orgId: string, name: string, excludeId?: string): Promise<void> {
    const existing = await Location.findOne({
      organisationId: orgId,
      name,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    })
      .select('_id')
      .lean()
      .exec();
    if (existing) {
      throw new HttpError(409, ERROR_CODES.CONFLICT, `A location named "${name}" already exists.`);
    }
  }

  return {
    async list(claims) {
      const orgId = requireOrgId(claims);
      const docs = await Location.find({ organisationId: orgId }).sort({ name: 1 }).lean().exec();
      const counts = await assetCounts(orgId);
      return docs.map((doc) => toPublic(doc, counts.get(String(doc._id)) ?? 0));
    },

    async create(claims, input, ip) {
      const orgId = requireOrgId(claims);
      const name = input.name.trim();
      await assertNameFree(orgId, name);

      let doc;
      try {
        doc = await Location.create({
          organisationId: orgId,
          name,
          code: input.code?.trim() || null,
        });
      } catch (error) {
        if (isDuplicateKey(error)) {
          throw new HttpError(
            409,
            ERROR_CODES.CONFLICT,
            `A location named "${name}" already exists.`,
          );
        }
        throw error;
      }

      await deps.audit.record({
        organisationId: orgId,
        userId: claims.userId,
        action: 'location.created',
        targetType: 'location',
        targetId: String(doc._id),
        metadata: { name },
        ip,
      });

      return toPublic(doc, 0);
    },

    async update(claims, locationId, input, ip) {
      const orgId = requireOrgId(claims);
      const doc = await Location.findOne({ _id: locationId, organisationId: orgId }).exec();
      if (!doc) throw new HttpError(404, ERROR_CODES.NOT_FOUND, 'Location not found.');

      const name = input.name.trim();
      await assertNameFree(orgId, name, locationId);

      doc.name = name;
      doc.code = input.code?.trim() || null;
      try {
        await doc.save();
      } catch (error) {
        if (isDuplicateKey(error)) {
          throw new HttpError(
            409,
            ERROR_CODES.CONFLICT,
            `A location named "${name}" already exists.`,
          );
        }
        throw error;
      }

      await deps.audit.record({
        organisationId: orgId,
        userId: claims.userId,
        action: 'location.updated',
        targetType: 'location',
        targetId: locationId,
        metadata: { name },
        ip,
      });

      const counts = await assetCounts(orgId);
      return toPublic(doc, counts.get(locationId) ?? 0);
    },

    async remove(claims, locationId, ip) {
      const orgId = requireOrgId(claims);
      const doc = await Location.findOne({ _id: locationId, organisationId: orgId })
        .select('_id name')
        .lean()
        .exec();
      if (!doc) throw new HttpError(404, ERROR_CODES.NOT_FOUND, 'Location not found.');

      const inUse = await Asset.countDocuments({
        organisationId: orgId,
        locationId: doc._id,
      }).exec();
      if (inUse > 0) {
        throw new HttpError(
          409,
          ERROR_CODES.CONFLICT,
          `This location is used by ${inUse} asset${inUse === 1 ? '' : 's'}. Move those assets first.`,
        );
      }

      await Location.deleteOne({ _id: doc._id }).exec();

      await deps.audit.record({
        organisationId: orgId,
        userId: claims.userId,
        action: 'location.deleted',
        targetType: 'location',
        targetId: locationId,
        metadata: { name: doc.name },
        ip,
      });
    },
  };
}
