import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_SIZE, ERROR_CODES, MAX_PAGE_SIZE, isApiErrorEnvelope } from './index.js';

describe('ERROR_CODES', () => {
  it('exposes stable API error codes', () => {
    expect(ERROR_CODES.NOT_FOUND).toBe('NOT_FOUND');
    expect(ERROR_CODES.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
    expect(ERROR_CODES.RATE_LIMITED).toBe('RATE_LIMITED');
  });
});

describe('pagination defaults', () => {
  it('uses conservative page sizes', () => {
    expect(DEFAULT_PAGE_SIZE).toBeLessThanOrEqual(MAX_PAGE_SIZE);
    expect(DEFAULT_PAGE_SIZE).toBeGreaterThan(0);
  });
});

describe('isApiErrorEnvelope', () => {
  it('accepts a well-formed error envelope', () => {
    expect(
      isApiErrorEnvelope({
        error: { code: 'NOT_FOUND', message: 'Asset not found', requestId: 'req-1' },
      }),
    ).toBe(true);
  });

  it('rejects non-object values', () => {
    expect(isApiErrorEnvelope(null)).toBe(false);
    expect(isApiErrorEnvelope('error')).toBe(false);
    expect(isApiErrorEnvelope(undefined)).toBe(false);
  });

  it('rejects objects without an error body', () => {
    expect(isApiErrorEnvelope({ data: { ok: true } })).toBe(false);
    expect(isApiErrorEnvelope({ error: 'boom' })).toBe(false);
  });

  it('rejects error bodies missing required string fields', () => {
    expect(isApiErrorEnvelope({ error: { code: 'NOT_FOUND', message: 'x' } })).toBe(false);
    expect(isApiErrorEnvelope({ error: { code: 'NOT_FOUND', message: 'x', requestId: 42 } })).toBe(
      false,
    );
  });
});
