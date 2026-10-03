import type { Env } from '../../config/env-schema.js';
import { logger } from '../../lib/logger.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailTransport {
  send(message: MailMessage): Promise<void>;
}

/**
 * Development transport: writes the full email (including action links) to the
 * API log. Real SMTP/API transports plug in behind the same interface.
 */
export function createLogTransport(): EmailTransport {
  return {
    async send(message) {
      logger.info('email.send', {
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
    },
  };
}

const transportFactories: Record<Env['EMAIL_TRANSPORT'], () => EmailTransport> = {
  log: createLogTransport,
};

export function createEmailTransport(kind: Env['EMAIL_TRANSPORT']): EmailTransport {
  return transportFactories[kind]();
}
