import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import type { MembershipRole } from '@assetflow/types';
import { ASSIGNABLE_ROLES, PERMISSIONS } from '@assetflow/shared';
import { requireObjectId } from '../lib/object-id.js';
import { requireActiveOrganisation } from '../middleware/tenant.js';
import { requirePermission } from '../middleware/require-permission.js';
import { validateBody } from '../middleware/validate.js';
import type { RequestContext } from '../services/auth-service.js';
import type { MemberService } from '../services/member-service.js';
import type { InvitationService } from '../services/invitation-service.js';
import type { OrganisationService } from '../services/organisation-service.js';

export interface OrganisationsRouterDeps {
  organisations: OrganisationService;
  members: MemberService;
  invitations: InvitationService;
  authenticate: RequestHandler;
}

const createOrgSchema = z.object({
  name: z.string().trim().min(1, 'Enter an organisation name.').max(120),
});

const renameOrgSchema = createOrgSchema;

const roleSchema = z.enum(ASSIGNABLE_ROLES as unknown as [MembershipRole, ...MembershipRole[]]);

const updateRoleSchema = z.object({ role: roleSchema });

const inviteSchema = z.object({
  email: z.email('Enter a valid email address.'),
  role: roleSchema,
});

function contextFrom(req: Request): RequestContext {
  return {
    ip: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  };
}

export function createOrganisationsRouter(deps: OrganisationsRouterDeps): Router {
  const router = Router();
  const ipOf = (req: Request) => req.ip ?? null;

  router.use(deps.authenticate);

  router.get('/', async (req, res) => {
    res.json({ data: await deps.organisations.listForUser(req.auth!) });
  });

  router.post('/', validateBody(createOrgSchema), async (req, res) => {
    const organisation = await deps.organisations.create(req.auth!, req.body.name, ipOf(req));
    res.status(201).json({ data: organisation });
  });

  // Everything below is scoped to the active organisation.
  const org = Router({ mergeParams: true });
  org.use(requireActiveOrganisation);

  org.get('/', async (req, res) => {
    res.json({ data: await deps.organisations.getActive(req.auth!) });
  });

  org.patch(
    '/',
    requirePermission(PERMISSIONS.SETTINGS_MANAGE),
    validateBody(renameOrgSchema),
    async (req, res) => {
      res.json({
        data: await deps.organisations.updateActive(req.auth!, req.body.name, ipOf(req)),
      });
    },
  );

  org.get('/members', async (req, res) => {
    res.json({ data: await deps.members.list(req.auth!) });
  });

  org.patch(
    '/members/:userId',
    requirePermission(PERMISSIONS.USERS_MANAGE),
    validateBody(updateRoleSchema),
    async (req, res) => {
      await deps.members.updateRole(
        req.auth!,
        requireObjectId(String(req.params.userId)),
        req.body.role,
        ipOf(req),
      );
      res.json({ data: null });
    },
  );

  org.delete('/members/:userId', requirePermission(PERMISSIONS.USERS_MANAGE), async (req, res) => {
    await deps.members.remove(req.auth!, requireObjectId(String(req.params.userId)), ipOf(req));
    res.json({ data: null });
  });

  org.get('/invitations', requirePermission(PERMISSIONS.USERS_MANAGE), async (req, res) => {
    res.json({ data: await deps.invitations.list(req.auth!) });
  });

  org.post(
    '/invitations',
    requirePermission(PERMISSIONS.USERS_MANAGE),
    validateBody(inviteSchema),
    async (req, res) => {
      const invitation = await deps.invitations.create(
        req.auth!,
        { email: req.body.email, role: req.body.role },
        contextFrom(req),
      );
      res.status(201).json({ data: invitation });
    },
  );

  org.delete(
    '/invitations/:invitationId',
    requirePermission(PERMISSIONS.USERS_MANAGE),
    async (req, res) => {
      await deps.invitations.revoke(
        req.auth!,
        requireObjectId(String(req.params.invitationId)),
        ipOf(req),
      );
      res.json({ data: null });
    },
  );

  router.use('/:id', org);
  return router;
}
