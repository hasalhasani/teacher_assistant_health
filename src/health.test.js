import { expect, test } from 'vitest';
import { buildRows, classify, countByStatus } from './health';

test('classify', () => {
  expect(classify(undefined)).toBe('unregistered');
  expect(classify({ active: false, runs: 10, failures: 0 })).toBe('unregistered');
  expect(classify({ active: true, runs: 0 })).toBe('idle');
  expect(classify({ active: true, runs: 100, failures: 0, lastStatus: 'success' })).toBe('healthy');
  expect(classify({ active: true, runs: 100, failures: 4, lastStatus: 'success' })).toBe('healthy');
  expect(classify({ active: true, runs: 100, failures: 5, lastStatus: 'success' })).toBe('degraded');
  // The latest run failing is worth a look even when the rate is low.
  expect(classify({ active: true, runs: 100, failures: 1, lastStatus: 'error' })).toBe('degraded');
  expect(classify({ active: true, runs: 4, failures: 2, lastStatus: 'error' })).toBe('failing');
});

test('buildRows joins expected paths with the reply', () => {
  const groups = buildRows([
    { path: 'login', active: true, runs: 3, failures: 0, lastStatus: 'success' },
    { path: '/signup', active: true, runs: 0 },
    { path: 'some-new-hook', active: true, runs: 1, failures: 1, lastStatus: 'error' },
    { path: 'dashboard-stats', active: true, runs: 9, failures: 0 },
  ]);
  const signIn = groups.find((g) => g.name === 'Sign-in').rows;
  expect(signIn.map((r) => r.status)).toEqual(['healthy', 'idle']);
  expect(groups.find((g) => g.name === 'Chat').rows[0].status).toBe('unregistered');
  // Unknown webhooks are listed; the dashboard's own endpoint is not.
  expect(groups.at(-1).rows.map((r) => r.path)).toEqual(['some-new-hook']);
  expect(countByStatus(groups).failing).toBe(1);
});
