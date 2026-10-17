import { expect, test } from 'vitest';
import { hashPassword, signSession, validSession, verifyPassword } from './auth';

test('password hashing', async () => {
  const stored = await hashPassword('correct horse');
  expect(stored).toMatch(/^100000:[0-9a-f]{32}:[0-9a-f]{64}$/);
  expect(stored).not.toContain('correct horse');
  // Salted: the same password never hashes to the same value twice.
  expect(await hashPassword('correct horse')).not.toBe(stored);
  expect(await verifyPassword('correct horse', stored)).toBe(true);
  expect(await verifyPassword('wrong', stored)).toBe(false);
  expect(await verifyPassword('', stored)).toBe(false);
  expect(await verifyPassword(null, stored)).toBe(false);
  expect(await verifyPassword('correct horse', undefined)).toBe(false);
});

test('session cookie', async () => {
  const now = 1000;
  const value = await signSession('secret', 2000);
  expect(await validSession('secret', value, now)).toBe(true);
  expect(await validSession('secret', value, 2000)).toBe(false); // expired
  expect(await validSession('other secret', value, now)).toBe(false);
  // A later expiry with the old signature is refused.
  expect(await validSession('secret', value.replace('2000', '9000'), now)).toBe(false);
  expect(await validSession('secret', '9000.', now)).toBe(false);
  expect(await validSession('secret', undefined, now)).toBe(false);
  expect(await validSession(undefined, value, now)).toBe(false);
});
