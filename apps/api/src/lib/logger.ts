import { env } from '../config/env.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: Number.POSITIVE_INFINITY,
};

const threshold = LEVEL_WEIGHT[env.LOG_LEVEL];

export type LogMeta = Record<string, unknown>;

function serializeMeta(meta?: LogMeta): string {
  if (!meta) return '';
  const normalized = Object.fromEntries(
    Object.entries(meta).map(([key, value]) => [
      key,
      value instanceof Error
        ? { name: value.name, message: value.message, stack: value.stack }
        : value,
    ]),
  );
  return ` ${JSON.stringify(normalized)}`;
}

function write(level: Exclude<LogLevel, 'silent'>, message: string, meta?: LogMeta): void {
  if (LEVEL_WEIGHT[level] < threshold) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}${serializeMeta(meta)}`;
  if (level === 'error' || level === 'warn') {
    process.stderr.write(`${line}\n`);
    return;
  }
  process.stdout.write(`${line}\n`);
}

export const logger = {
  debug: (message: string, meta?: LogMeta) => write('debug', message, meta),
  info: (message: string, meta?: LogMeta) => write('info', message, meta),
  warn: (message: string, meta?: LogMeta) => write('warn', message, meta),
  error: (message: string, meta?: LogMeta) => write('error', message, meta),
};
