import { isValidObjectId } from 'mongoose';
import { ERROR_CODES } from '@assetflow/shared';
import { HttpError } from './http-error.js';

/** Returns the id when it is a valid ObjectId, otherwise throws a 404. */
export function requireObjectId(value: string): string {
  if (!isValidObjectId(value)) {
    throw new HttpError(404, ERROR_CODES.NOT_FOUND, 'Resource not found.');
  }
  return value;
}
