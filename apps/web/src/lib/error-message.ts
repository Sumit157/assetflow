import { ApiClientError } from './api';

export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) return error.message;
  return fallback;
}
