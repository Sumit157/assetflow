import type { AuditAction } from '@assetflow/types';
import { logger } from '../lib/logger.js';
import { AuditLog } from '../models/audit-log.js';

export interface AuditEntry {
  organisationId?: string | null;
  userId?: string | null;
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

export interface AuditService {
  record(entry: AuditEntry): Promise<void>;
}

export function createAuditService(): AuditService {
  return {
    async record(entry) {
      try {
        await AuditLog.create(entry);
      } catch (error) {
        logger.warn('audit write failed', { action: entry.action, error });
      }
    },
  };
}
