import { env } from '../../config/env.js';
import type { EmailTransport } from './transport.js';

export interface EmailService {
  sendVerificationEmail(to: string, rawToken: string): Promise<void>;
  sendPasswordResetEmail(to: string, rawToken: string): Promise<void>;
  sendInvitationEmail(
    to: string,
    input: { organisationName: string; inviterName: string; roleLabel: string; rawToken: string },
  ): Promise<void>;
}

export function createEmailService(transport: EmailTransport): EmailService {
  return {
    async sendVerificationEmail(to, rawToken) {
      const link = `${env.WEB_URL}/verify-email?token=${encodeURIComponent(rawToken)}`;
      await transport.send({
        to,
        subject: 'Verify your AssetFlow email address',
        text: [
          'Welcome to AssetFlow.',
          '',
          'Confirm your email address by opening the link below:',
          link,
          '',
          'If you did not create an Account, you can ignore this email.',
        ].join('\n'),
      });
    },

    async sendPasswordResetEmail(to, rawToken) {
      const link = `${env.WEB_URL}/reset-password?token=${encodeURIComponent(rawToken)}`;
      await transport.send({
        to,
        subject: 'Reset your AssetFlow password',
        text: [
          'Someone requested a password reset for this AssetFlow account.',
          '',
          'Open the link below to choose a new password (valid for 1 hour):',
          link,
          '',
          'If you did not request this, you can safely ignore this email.',
        ].join('\n'),
      });
    },

    async sendInvitationEmail(to, input) {
      const link = `${env.WEB_URL}/invitations/${encodeURIComponent(input.rawToken)}`;
      await transport.send({
        to,
        subject: `${input.inviterName} invited you to ${input.organisationName} on AssetFlow`,
        text: [
          `${input.inviterName} invited you to join ${input.organisationName} on AssetFlow as ${input.roleLabel}.`,
          '',
          'Open the link below to accept the invitation:',
          link,
          '',
          'If you do not have an Account yet, you can create one with this email address first.',
        ].join('\n'),
      });
    },
  };
}
