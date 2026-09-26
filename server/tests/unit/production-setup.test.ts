import { describe, it, expect } from 'vitest';
// @ts-expect-error deployment helper is plain JavaScript
import { planConfiguration } from '../../scripts/setup-production.mjs';

describe('production configuration repair', () => {
  it('replaces default encryption and identical JWT secrets with independent random keys', () => {
    const result = planConfiguration({ ENCRYPTION_KEY: 'leadflow-dev-only-encryption-key-0001', JWT_ACCESS_SECRET: 'same-secret-long-enough', JWT_REFRESH_SECRET: 'same-secret-long-enough' });
    expect(result.ENCRYPTION_KEY).toMatch(/^[a-f0-9]{64}$/);
    expect(result.JWT_ACCESS_SECRET).toBe('same-secret-long-enough');
    expect(result.JWT_REFRESH_SECRET).not.toBe(result.JWT_ACCESS_SECRET);
    expect(result.CLIENT_ORIGIN).toBe('https://leads.mzistudio.com');
  });
  it('preserves private keys and unrelated configuration', () => {
    const source = { ENCRYPTION_KEY: 'a'.repeat(64), JWT_ACCESS_SECRET: 'b'.repeat(64), JWT_REFRESH_SECRET: 'c'.repeat(64), DATABASE_URL: 'postgres://unchanged' };
    expect(planConfiguration(source)).toMatchObject(source);
  });
  it('refuses to silently replace an existing short encryption key', () => {
    expect(() => planConfiguration({ ENCRYPTION_KEY: 'existing-key' })).toThrow(/existing encryption key/i);
  });
  it('generates missing secrets and is idempotent', () => {
    const result = planConfiguration({});
    expect(new Set([result.ENCRYPTION_KEY, result.JWT_ACCESS_SECRET, result.JWT_REFRESH_SECRET]).size).toBe(3);
    expect(planConfiguration(result)).toEqual(result);
  });
});
