import type { MembershipRole, OrganisationPublic } from '@assetflow/types';
import { ERROR_CODES, ROLES } from '@assetflow/shared';
import { HttpError } from '../lib/http-error.js';
import { Organisation } from '../models/organisation.js';
import { OrganisationMember } from '../models/organisation-member.js';
import type { AuthContext } from '../types/auth-context.js';
import type { AuditService } from './audit-service.js';

export type OrganisationListRow = OrganisationPublic & { role: MembershipRole };

export interface OrganisationServiceDeps {
  audit: AuditService;
}

export interface OrganisationService {
  listForUser(claims: AuthContext): Promise<OrganisationListRow[]>;
  create(claims: AuthContext, name: string, ip: string | null): Promise<OrganisationPublic>;
  getActive(claims: AuthContext): Promise<OrganisationPublic>;
  updateActive(claims: AuthContext, name: string, ip: string | null): Promise<OrganisationPublic>;
}

function toPublic(org: { _id: unknown; name: string; createdAt: Date }): OrganisationPublic {
  return { id: String(org._id), name: org.name, createdAt: org.createdAt.toISOString() };
}

export function createOrganisationService(deps: OrganisationServiceDeps): OrganisationService {
  async function requireActiveOrgDoc(claims: AuthContext) {
    if (!claims.orgId) {
      throw new HttpError(
        403,
        ERROR_CODES.ORGANISATION_REQUIRED,
        'You do not have an active organisation.',
      );
    }
    const org = await Organisation.findById(claims.orgId).lean().exec();
    if (!org) {
      throw new HttpError(404, ERROR_CODES.NOT_FOUND, 'Organisation not found.');
    }
    return org;
  }

  return {
    async listForUser(claims) {
      const memberships = await OrganisationMember.find({ userId: claims.userId })
        .sort({ createdAt: 1 })
        .lean()
        .exec();
      if (memberships.length === 0) return [];

      const orgs = await Organisation.find({
        _id: { $in: memberships.map((m) => m.organisationId) },
      })
        .lean()
        .exec();
      const orgById = new Map(orgs.map((org) => [String(org._id), org]));

      return memberships.flatMap((membership) => {
        const org = orgById.get(String(membership.organisationId));
        if (!org) return [];
        return [{ ...toPublic(org), role: membership.role }];
      });
    },

    async create(claims, name, ip) {
      const org = await Organisation.create({ name: name.trim() });
      await OrganisationMember.create({
        organisationId: org._id,
        userId: claims.userId,
        role: ROLES.ORG_ADMIN,
      });

      await deps.audit.record({
        organisationId: String(org._id),
        userId: claims.userId,
        action: 'organisation.created',
        targetType: 'organisation',
        targetId: String(org._id),
        ip,
      });

      return toPublic(org);
    },

    async getActive(claims) {
      const org = await requireActiveOrgDoc(claims);
      return toPublic(org);
    },

    async updateActive(claims, name, ip) {
      const org = await requireActiveOrgDoc(claims);
      const trimmed = name.trim();
      if (trimmed === org.name) return toPublic(org);

      await Organisation.updateOne({ _id: org._id }, { $set: { name: trimmed } }).exec();
      await deps.audit.record({
        organisationId: String(org._id),
        userId: claims.userId,
        action: 'organisation.updated',
        targetType: 'organisation',
        targetId: String(org._id),
        metadata: { from: org.name, to: trimmed },
        ip,
      });

      return { id: String(org._id), name: trimmed, createdAt: org.createdAt.toISOString() };
    },
  };
}
