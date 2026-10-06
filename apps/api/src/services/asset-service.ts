import type {
  AssetAssignmentPublic,
  AssetCondition,
  AssetHistory,
  AssetListQuery,
  AssetPublic,
  AssetTransferPublic,
  Paginated,
} from '@assetflow/types';
import { ERROR_CODES } from '@assetflow/shared';
import { HttpError } from '../lib/http-error.js';
import { logger } from '../lib/logger.js';
import { Asset } from '../models/asset.js';
import { AssetAssignment } from '../models/asset-assignment.js';
import { AssetTransfer } from '../models/asset-transfer.js';
import { AssetCategory } from '../models/asset-category.js';
import { Location } from '../models/location.js';
import { OrganisationMember } from '../models/organisation-member.js';
import { User } from '../models/user.js';
import type { AuthContext } from '../types/auth-context.js';
import type { AuditService } from './audit-service.js';
import { requireOrgId } from './org-context.js';

export interface AssetServiceDeps {
  audit: AuditService;
}

export interface AssetCreateInput {
  name: string;
  assetTag: string;
  description?: string | null;
  categoryId?: string | null;
  locationId?: string | null;
  serialNumber?: string | null;
  condition?: AssetCondition;
}

export interface AssetUpdateInput {
  name?: string;
  assetTag?: string;
  description?: string | null;
  categoryId?: string | null;
  locationId?: string | null;
  serialNumber?: string | null;
  condition?: AssetCondition;
}

export interface AssetService {
  list(claims: AuthContext, query: AssetListQuery): Promise<Paginated<AssetPublic>>;
  get(claims: AuthContext, assetId: string): Promise<AssetPublic>;
  create(claims: AuthContext, input: AssetCreateInput, ip: string | null): Promise<AssetPublic>;
  update(
    claims: AuthContext,
    assetId: string,
    input: AssetUpdateInput,
    ip: string | null,
  ): Promise<AssetPublic>;
  remove(claims: AuthContext, assetId: string, ip: string | null): Promise<void>;
  assign(
    claims: AuthContext,
    assetId: string,
    input: { assignedToUserId: string; notes?: string | null },
    ip: string | null,
  ): Promise<AssetPublic>;
  returnAsset(
    claims: AuthContext,
    assetId: string,
    input: { condition?: AssetCondition; notes?: string | null },
    ip: string | null,
  ): Promise<AssetPublic>;
  transfer(
    claims: AuthContext,
    assetId: string,
    input: { toUserId: string; toLocationId?: string | null; notes?: string | null },
    ip: string | null,
  ): Promise<AssetPublic>;
  retire(
    claims: AuthContext,
    assetId: string,
    input: { reason?: string | null },
    ip: string | null,
  ): Promise<AssetPublic>;
  history(claims: AuthContext, assetId: string): Promise<AssetHistory>;
}

interface AssetShape {
  _id: unknown;
  organisationId: unknown;
  name: string;
  assetTag: string;
  barcode: string;
  description?: string | null;
  categoryId?: unknown;
  locationId?: unknown;
  serialNumber?: string | null;
  condition: AssetCondition;
  status: AssetPublic['status'];
  assignedToUserId?: unknown;
  retiredAt?: Date | null;
  retirementReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface NameMaps {
  categories: Map<string, string>;
  locations: Map<string, string>;
  users: Map<string, string>;
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  );
}

function duplicateKeyField(error: unknown): string | null {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: string }).message)
      : '';
  const match = message.match(/dup key: (\w+)/);
  return match?.[1] ?? null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function duplicateTagError(): HttpError {
  return new HttpError(409, ERROR_CODES.CONFLICT, 'An asset with this tag already exists.');
}

function duplicateSerialError(): HttpError {
  return new HttpError(
    409,
    ERROR_CODES.CONFLICT,
    'An asset with this serial number already exists.',
  );
}

function conflict(message: string): HttpError {
  return new HttpError(409, ERROR_CODES.CONFLICT, message);
}

export function createAssetService(deps: AssetServiceDeps): AssetService {
  async function loadAssetOr404(orgId: string, assetId: string) {
    const doc = await Asset.findOne({ _id: assetId, organisationId: orgId }).exec();
    if (!doc) throw new HttpError(404, ERROR_CODES.NOT_FOUND, 'Asset not found.');
    return doc;
  }

  async function assertCategoryInOrg(orgId: string, categoryId: string | null | undefined) {
    if (!categoryId) return;
    const doc = await AssetCategory.findOne({ _id: categoryId, organisationId: orgId })
      .select('_id')
      .lean()
      .exec();
    if (!doc) throw new HttpError(404, ERROR_CODES.NOT_FOUND, 'Category not found.');
  }

  async function assertLocationInOrg(orgId: string, locationId: string | null | undefined) {
    if (!locationId) return;
    const doc = await Location.findOne({ _id: locationId, organisationId: orgId })
      .select('_id')
      .lean()
      .exec();
    if (!doc) throw new HttpError(404, ERROR_CODES.NOT_FOUND, 'Location not found.');
  }

  async function assertMemberInOrg(orgId: string, userId: string): Promise<void> {
    const membership = await OrganisationMember.findOne({
      organisationId: orgId,
      userId,
    })
      .select('_id')
      .lean()
      .exec();
    if (!membership) {
      throw conflict('That user is not a member of this organisation.');
    }
  }

  async function loadNameMaps(orgId: string, docs: AssetShape[]): Promise<NameMaps> {
    const categoryIds = [
      ...new Set(
        docs
          .map((doc) => doc.categoryId)
          .filter(Boolean)
          .map(String),
      ),
    ];
    const locationIds = [
      ...new Set(
        docs
          .map((doc) => doc.locationId)
          .filter(Boolean)
          .map(String),
      ),
    ];
    const userIds = [
      ...new Set(
        docs
          .map((doc) => doc.assignedToUserId)
          .filter(Boolean)
          .map(String),
      ),
    ];

    const [categories, locations, users] = await Promise.all([
      categoryIds.length
        ? AssetCategory.find({ _id: { $in: categoryIds }, organisationId: orgId })
            .select('name')
            .lean()
            .exec()
        : Promise.resolve([]),
      locationIds.length
        ? Location.find({ _id: { $in: locationIds }, organisationId: orgId })
            .select('name')
            .lean()
            .exec()
        : Promise.resolve([]),
      userIds.length
        ? User.find({ _id: { $in: userIds } })
            .select('name')
            .lean()
            .exec()
        : Promise.resolve([]),
    ]);

    return {
      categories: new Map(categories.map((doc) => [String(doc._id), doc.name])),
      locations: new Map(locations.map((doc) => [String(doc._id), doc.name])),
      users: new Map(users.map((doc) => [String(doc._id), doc.name])),
    };
  }

  function toPublic(doc: AssetShape, maps: NameMaps): AssetPublic {
    const categoryId = doc.categoryId ? String(doc.categoryId) : null;
    const locationId = doc.locationId ? String(doc.locationId) : null;
    const assignedToUserId = doc.assignedToUserId ? String(doc.assignedToUserId) : null;
    return {
      id: String(doc._id),
      organisationId: String(doc.organisationId),
      name: doc.name,
      assetTag: doc.assetTag,
      barcode: doc.barcode,
      description: doc.description ?? null,
      categoryId,
      categoryName: categoryId ? (maps.categories.get(categoryId) ?? null) : null,
      locationId,
      locationName: locationId ? (maps.locations.get(locationId) ?? null) : null,
      serialNumber: doc.serialNumber ?? null,
      condition: doc.condition,
      status: doc.status,
      assignedToUserId,
      assignedToName: assignedToUserId ? (maps.users.get(assignedToUserId) ?? null) : null,
      retiredAt: doc.retiredAt ? doc.retiredAt.toISOString() : null,
      retirementReason: doc.retirementReason ?? null,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }

  async function currentPublic(orgId: string, assetId: string): Promise<AssetPublic> {
    const doc = await loadAssetOr404(orgId, assetId);
    const maps = await loadNameMaps(orgId, [doc]);
    return toPublic(doc, maps);
  }

  return {
    async list(claims, query) {
      const orgId = requireOrgId(claims);

      const filter: Record<string, unknown> = { organisationId: orgId };
      if (query.q) {
        const pattern = new RegExp(escapeRegex(query.q), 'i');
        filter.$or = [
          { name: pattern },
          { assetTag: pattern },
          { serialNumber: pattern },
          { barcode: pattern },
        ];
      }
      if (query.status) filter.status = query.status;
      if (query.categoryId) filter.categoryId = query.categoryId;
      if (query.locationId) filter.locationId = query.locationId;
      if (query.assignedTo) filter.assignedToUserId = query.assignedTo;

      const direction = query.sortDir === 'asc' ? 1 : -1;
      const sort: Record<string, 1 | -1> = { [query.sortBy]: direction };

      const [total, docs] = await Promise.all([
        Asset.countDocuments(filter).exec(),
        Asset.find(filter)
          .sort(sort)
          .skip((query.page - 1) * query.limit)
          .limit(query.limit)
          .lean()
          .exec(),
      ]);

      const maps = await loadNameMaps(orgId, docs);
      return {
        items: docs.map((doc) => toPublic(doc, maps)),
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      };
    },

    async get(claims, assetId) {
      const orgId = requireOrgId(claims);
      return currentPublic(orgId, assetId);
    },

    async create(claims, input, ip) {
      const orgId = requireOrgId(claims);
      const assetTag = input.assetTag.trim();

      await assertCategoryInOrg(orgId, input.categoryId);
      await assertLocationInOrg(orgId, input.locationId);

      const existingTag = await Asset.findOne({ organisationId: orgId, assetTag })
        .select('_id')
        .lean()
        .exec();
      if (existingTag) throw duplicateTagError();

      const serialNumber = input.serialNumber?.trim() || null;
      if (serialNumber) {
        const existingSerial = await Asset.findOne({ organisationId: orgId, serialNumber })
          .select('_id')
          .lean()
          .exec();
        if (existingSerial) throw duplicateSerialError();
      }

      let created;
      try {
        created = await Asset.create({
          organisationId: orgId,
          name: input.name.trim(),
          assetTag,
          barcode: assetTag,
          description: input.description?.trim() || null,
          categoryId: input.categoryId ?? null,
          locationId: input.locationId ?? null,
          serialNumber,
          condition: input.condition ?? 'good',
        });
      } catch (error) {
        if (isDuplicateKey(error)) {
          if (duplicateKeyField(error) === 'serialNumber') throw duplicateSerialError();
          throw duplicateTagError();
        }
        throw error;
      }

      await deps.audit.record({
        organisationId: orgId,
        userId: claims.userId,
        action: 'asset.created',
        targetType: 'asset',
        targetId: String(created._id),
        metadata: { assetTag },
        ip,
      });

      return currentPublic(orgId, String(created._id));
    },

    async update(claims, assetId, input, ip) {
      const orgId = requireOrgId(claims);
      const doc = await loadAssetOr404(orgId, assetId);

      const changed: string[] = [];

      if (input.name !== undefined && input.name.trim() !== doc.name) {
        doc.name = input.name.trim();
        changed.push('name');
      }

      if (input.assetTag !== undefined && input.assetTag.trim() !== doc.assetTag) {
        const assetTag = input.assetTag.trim();
        const existing = await Asset.findOne({
          organisationId: orgId,
          assetTag,
          _id: { $ne: assetId },
        })
          .select('_id')
          .lean()
          .exec();
        if (existing) throw duplicateTagError();
        doc.assetTag = assetTag;
        changed.push('assetTag');
      }

      if (input.description !== undefined) {
        const description = input.description?.trim() || null;
        if (description !== (doc.description ?? null)) {
          doc.description = description;
          changed.push('description');
        }
      }

      if (input.categoryId !== undefined) {
        const categoryId = input.categoryId || null;
        const currentCategoryId = doc.categoryId ? String(doc.categoryId) : null;
        if (categoryId !== currentCategoryId) {
          await assertCategoryInOrg(orgId, categoryId);
          doc.set('categoryId', categoryId);
          changed.push('categoryId');
        }
      }

      if (input.locationId !== undefined) {
        const locationId = input.locationId || null;
        const currentLocationId = doc.locationId ? String(doc.locationId) : null;
        if (locationId !== currentLocationId) {
          await assertLocationInOrg(orgId, locationId);
          doc.set('locationId', locationId);
          changed.push('locationId');
        }
      }

      if (input.serialNumber !== undefined) {
        const serialNumber = input.serialNumber?.trim() || null;
        if (serialNumber !== (doc.serialNumber ?? null)) {
          if (serialNumber) {
            const existing = await Asset.findOne({
              organisationId: orgId,
              serialNumber,
              _id: { $ne: assetId },
            })
              .select('_id')
              .lean()
              .exec();
            if (existing) throw duplicateSerialError();
          }
          doc.serialNumber = serialNumber;
          changed.push('serialNumber');
        }
      }

      if (input.condition !== undefined && input.condition !== doc.condition) {
        doc.condition = input.condition;
        changed.push('condition');
      }

      if (changed.length > 0) {
        try {
          await doc.save();
        } catch (error) {
          if (isDuplicateKey(error)) {
            if (duplicateKeyField(error) === 'serialNumber') throw duplicateSerialError();
            throw duplicateTagError();
          }
          throw error;
        }

        await deps.audit.record({
          organisationId: orgId,
          userId: claims.userId,
          action: 'asset.updated',
          targetType: 'asset',
          targetId: assetId,
          metadata: { fields: changed },
          ip,
        });
      }

      return currentPublic(orgId, assetId);
    },

    async remove(claims, assetId, ip) {
      const orgId = requireOrgId(claims);
      const doc = await loadAssetOr404(orgId, assetId);

      const [assignments, transfers] = await Promise.all([
        AssetAssignment.countDocuments({ organisationId: orgId, assetId: doc._id }).exec(),
        AssetTransfer.countDocuments({ organisationId: orgId, assetId: doc._id }).exec(),
      ]);
      if (assignments > 0 || transfers > 0) {
        throw conflict('This asset has assignment history. Retire it instead of deleting it.');
      }

      await Asset.deleteOne({ _id: doc._id, organisationId: orgId }).exec();

      await deps.audit.record({
        organisationId: orgId,
        userId: claims.userId,
        action: 'asset.deleted',
        targetType: 'asset',
        targetId: assetId,
        metadata: { assetTag: doc.assetTag },
        ip,
      });
    },

    async assign(claims, assetId, input, ip) {
      const orgId = requireOrgId(claims);
      const doc = await loadAssetOr404(orgId, assetId);

      if (doc.status === 'retired') {
        throw conflict('Retired assets cannot be assigned.');
      }
      if (doc.status === 'assigned') {
        throw conflict('This asset is already assigned. Return or transfer it first.');
      }
      await assertMemberInOrg(orgId, input.assignedToUserId);

      const updated = await Asset.findOneAndUpdate(
        { _id: doc._id, organisationId: orgId, status: 'available' },
        { $set: { status: 'assigned', assignedToUserId: input.assignedToUserId } },
        { new: true },
      ).exec();
      if (!updated) {
        throw conflict('This asset just changed state. Reload and try again.');
      }

      try {
        await AssetAssignment.create({
          organisationId: orgId,
          assetId: doc._id,
          assignedToUserId: input.assignedToUserId,
          assignedByUserId: claims.userId,
          notes: input.notes?.trim() || null,
        });
      } catch (error) {
        await Asset.updateOne(
          { _id: doc._id, organisationId: orgId },
          { $set: { status: 'available', assignedToUserId: null } },
        ).exec();
        throw error;
      }

      await deps.audit.record({
        organisationId: orgId,
        userId: claims.userId,
        action: 'asset.assigned',
        targetType: 'asset',
        targetId: assetId,
        metadata: { assetTag: doc.assetTag, toUserId: input.assignedToUserId },
        ip,
      });

      return currentPublic(orgId, assetId);
    },

    async returnAsset(claims, assetId, input, ip) {
      const orgId = requireOrgId(claims);
      const doc = await loadAssetOr404(orgId, assetId);

      if (doc.status !== 'assigned') {
        throw conflict('This asset is not currently assigned.');
      }

      const set: Record<string, unknown> = {
        status: 'available',
        assignedToUserId: null,
      };
      if (input.condition) set.condition = input.condition;

      const updated = await Asset.findOneAndUpdate(
        { _id: doc._id, organisationId: orgId, status: 'assigned' },
        { $set: set },
        { new: true },
      ).exec();
      if (!updated) {
        throw conflict('This asset just changed state. Reload and try again.');
      }

      try {
        const closed = await AssetAssignment.findOneAndUpdate(
          { organisationId: orgId, assetId: doc._id, returnedAt: null },
          {
            $set: {
              returnedAt: new Date(),
              returnedByUserId: claims.userId,
              returnCondition: input.condition ?? null,
            },
          },
        ).exec();
        if (!closed) {
          logger.warn('no open assignment found while returning asset', {
            assetId,
            organisationId: orgId,
          });
        }
      } catch (error) {
        await Asset.updateOne(
          { _id: doc._id, organisationId: orgId },
          { $set: { status: 'assigned', assignedToUserId: doc.assignedToUserId } },
        ).exec();
        throw error;
      }

      await deps.audit.record({
        organisationId: orgId,
        userId: claims.userId,
        action: 'asset.returned',
        targetType: 'asset',
        targetId: assetId,
        metadata: { assetTag: doc.assetTag, condition: input.condition ?? doc.condition },
        ip,
      });

      return currentPublic(orgId, assetId);
    },

    async transfer(claims, assetId, input, ip) {
      const orgId = requireOrgId(claims);
      const doc = await loadAssetOr404(orgId, assetId);

      if (doc.status !== 'assigned') {
        throw conflict('Only assigned assets can be transferred.');
      }
      const fromUserId = doc.assignedToUserId ? String(doc.assignedToUserId) : null;
      if (!fromUserId) {
        throw conflict('This asset has no current assignee. Reload and try again.');
      }
      if (input.toUserId === fromUserId) {
        throw conflict('This asset is already assigned to that user.');
      }
      await assertMemberInOrg(orgId, input.toUserId);
      await assertLocationInOrg(orgId, input.toLocationId);

      const fromLocationId = doc.locationId ?? null;
      const targetLocationId = input.toLocationId || null;

      const set: Record<string, unknown> = { assignedToUserId: input.toUserId };
      if (targetLocationId) set.locationId = targetLocationId;

      const updated = await Asset.findOneAndUpdate(
        {
          _id: doc._id,
          organisationId: orgId,
          status: 'assigned',
          assignedToUserId: fromUserId,
        },
        { $set: set },
        { new: true },
      ).exec();
      if (!updated) {
        throw conflict('This asset just changed state. Reload and try again.');
      }

      try {
        const closed = await AssetAssignment.findOneAndUpdate(
          { organisationId: orgId, assetId: doc._id, returnedAt: null },
          {
            $set: {
              returnedAt: new Date(),
              returnedByUserId: claims.userId,
              returnCondition: null,
            },
          },
        ).exec();
        if (!closed) {
          logger.warn('no open assignment found while transferring asset', {
            assetId,
            organisationId: orgId,
          });
        }

        await AssetAssignment.create({
          organisationId: orgId,
          assetId: doc._id,
          assignedToUserId: input.toUserId,
          assignedByUserId: claims.userId,
        });

        await AssetTransfer.create({
          organisationId: orgId,
          assetId: doc._id,
          fromUserId,
          toUserId: input.toUserId,
          fromLocationId,
          toLocationId: targetLocationId ?? fromLocationId,
          transferredByUserId: claims.userId,
          notes: input.notes?.trim() || null,
        });
      } catch (error) {
        await Asset.updateOne(
          { _id: doc._id, organisationId: orgId },
          { $set: { assignedToUserId: fromUserId } },
        ).exec();
        throw error;
      }

      await deps.audit.record({
        organisationId: orgId,
        userId: claims.userId,
        action: 'asset.transferred',
        targetType: 'asset',
        targetId: assetId,
        metadata: { assetTag: doc.assetTag, fromUserId, toUserId: input.toUserId },
        ip,
      });

      return currentPublic(orgId, assetId);
    },

    async retire(claims, assetId, input, ip) {
      const orgId = requireOrgId(claims);
      const doc = await loadAssetOr404(orgId, assetId);

      if (doc.status === 'retired') {
        throw conflict('This asset is already retired.');
      }
      if (doc.status !== 'available') {
        throw conflict('Return the asset before retiring it.');
      }

      const updated = await Asset.findOneAndUpdate(
        { _id: doc._id, organisationId: orgId, status: 'available' },
        {
          $set: {
            status: 'retired',
            retiredAt: new Date(),
            retirementReason: input.reason?.trim() || null,
          },
        },
        { new: true },
      ).exec();
      if (!updated) {
        throw conflict('This asset just changed state. Reload and try again.');
      }

      await deps.audit.record({
        organisationId: orgId,
        userId: claims.userId,
        action: 'asset.retired',
        targetType: 'asset',
        targetId: assetId,
        metadata: { assetTag: doc.assetTag, reason: input.reason ?? null },
        ip,
      });

      return currentPublic(orgId, assetId);
    },

    async history(claims, assetId) {
      const orgId = requireOrgId(claims);
      const doc = await loadAssetOr404(orgId, assetId);

      const [assignments, transfers] = await Promise.all([
        AssetAssignment.find({ organisationId: orgId, assetId: doc._id })
          .sort({ assignedAt: -1 })
          .lean()
          .exec(),
        AssetTransfer.find({ organisationId: orgId, assetId: doc._id })
          .sort({ transferredAt: -1 })
          .lean()
          .exec(),
      ]);

      const userIds = [
        ...new Set([
          ...assignments.flatMap((row) => [
            String(row.assignedToUserId),
            String(row.assignedByUserId),
            ...(row.returnedByUserId ? [String(row.returnedByUserId)] : []),
          ]),
          ...transfers.flatMap((row) => [
            ...(row.fromUserId ? [String(row.fromUserId)] : []),
            String(row.toUserId),
            String(row.transferredByUserId),
          ]),
        ]),
      ];
      const users = userIds.length
        ? await User.find({ _id: { $in: userIds } })
            .select('name')
            .lean()
            .exec()
        : [];
      const names = new Map(users.map((user) => [String(user._id), user.name]));
      const nameOf = (id: unknown) => (id ? (names.get(String(id)) ?? null) : null);

      const assignmentRows: AssetAssignmentPublic[] = assignments.map((row) => ({
        id: String(row._id),
        assetId: String(doc._id),
        assetName: doc.name,
        assetTag: doc.assetTag,
        assignedToUserId: String(row.assignedToUserId),
        assignedToName: nameOf(row.assignedToUserId) ?? 'Unknown user',
        assignedByName: nameOf(row.assignedByUserId) ?? 'Unknown user',
        assignedAt: row.assignedAt.toISOString(),
        returnedAt: row.returnedAt ? row.returnedAt.toISOString() : null,
        returnedByName: row.returnedByUserId ? nameOf(row.returnedByUserId) : null,
        returnCondition: row.returnCondition ?? null,
        notes: row.notes ?? null,
      }));

      const transferRows: AssetTransferPublic[] = transfers.map((row) => ({
        id: String(row._id),
        assetId: String(doc._id),
        assetName: doc.name,
        assetTag: doc.assetTag,
        fromUserId: row.fromUserId ? String(row.fromUserId) : null,
        fromUserName: nameOf(row.fromUserId),
        toUserId: String(row.toUserId),
        toUserName: nameOf(row.toUserId) ?? 'Unknown user',
        transferredByName: nameOf(row.transferredByUserId) ?? 'Unknown user',
        transferredAt: row.transferredAt.toISOString(),
        notes: row.notes ?? null,
      }));

      return { assignments: assignmentRows, transfers: transferRows };
    },
  };
}
