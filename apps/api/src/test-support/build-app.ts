import { createApp } from '../app.js';
import { createAuditService } from '../services/audit-service.js';
import { createAuthService } from '../services/auth-service.js';
import { createCredentialService } from '../services/credential-service.js';
import { createEmailService } from '../services/email/email-service.js';
import type { MailMessage, EmailTransport } from '../services/email/transport.js';
import { createHealthService } from '../services/health-service.js';
import { createInvitationService } from '../services/invitation-service.js';
import { createMemberService } from '../services/member-service.js';
import { createOrganisationService } from '../services/organisation-service.js';

export interface ProbeOptions {
  mongo?: () => Promise<void>;
  redis?: () => Promise<void>;
}

export interface TestApp {
  app: ReturnType<typeof createApp>;
  /** Captures every email the app would send (links included). */
  mailbox: MailMessage[];
}

export function buildApp(options: ProbeOptions = {}): TestApp {
  const mailbox: MailMessage[] = [];
  const transport: EmailTransport = {
    async send(message) {
      mailbox.push(message);
    },
  };

  const email = createEmailService(transport);
  const audit = createAuditService();

  const app = createApp({
    healthService: createHealthService({
      pingMongo: options.mongo ?? (async () => undefined),
      pingRedis: options.redis ?? (async () => undefined),
    }),
    auth: createAuthService({ email, audit }),
    credentials: createCredentialService({ email, audit }),
    organisations: createOrganisationService({ audit }),
    members: createMemberService({ audit }),
    invitations: createInvitationService({ email, audit }),
  });

  return { app, mailbox };
}
