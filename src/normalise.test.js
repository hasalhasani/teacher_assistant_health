import { expect, test } from 'vitest';
import { normalise } from './normalise';
import fixture from './fixture.json';

const NOW = new Date('2026-10-05T10:00:00.000Z').getTime();

test('raw error_log rows, as the webhook returns them', () => {
  const rows = [
    { id: '7', occurred_at: '2026-10-05T09:50:47.073Z', workflow_id: 'od8h', workflow_name: 'Chat-Vis', node_name: 'Compliance Check Agent', execution_id: '6805', environment: 'dev', level: 'error', error_message: 'No prompt specified', context: {} },
    { id: '8', occurred_at: '2026-10-05T09:55:00.000Z', workflow_id: 'zz', workflow_name: null, node_name: 'LLM', execution_id: '6806', environment: 'dev', level: 'fatal', error_message: 'boom', context: {} },
    { id: '1', occurred_at: '2026-09-17T09:50:47.073Z', workflow_id: 'od8h', workflow_name: 'Chat-Vis', node_name: 'x', execution_id: '1', environment: 'dev', level: 'error', error_message: 'old', context: {} },
  ];
  const out = normalise(rows, '24h', NOW);
  expect(out.backendErrors.count).toBe(2); // the September row is outside 24 hours
  expect(out.backendErrors.recent[0]).toMatchObject({ workflow: 'zz', node: 'LLM', message: 'boom', executionId: '6806', level: 'fatal' });
  expect(out.backendErrors.byWorkflow).toEqual([{ key: 'zz', count: 1 }, { key: 'Chat-Vis', count: 1 }]);
  // Tables the reply did not include are null, not zero.
  expect(out.frontendErrors).toBeNull();
  expect(out.feedback).toBeNull();
  expect(normalise(rows, '7d', NOW).backendErrors.count).toBe(2);
  // The same rows wrapped by an Aggregate node, which is what dev returns.
  expect(normalise([{ data: rows }], '24h', NOW).backendErrors.count).toBe(2);
  expect(normalise([{ data: rows }], '24h', NOW).totalRows).toBe(3);
  expect(() => normalise('nope', '24h', NOW)).toThrow();
  expect(normalise({ nope: true }, '24h', NOW).totalRows).toBe(0);
});

test('named groups, as dev returns them, with executions', () => {
  const reply = {
    'Get many executions': [
      { id: '3', workflowId: 'od8h', mode: 'webhook', status: 'error', startedAt: '2026-10-05T09:58:00.000Z', stoppedAt: '2026-10-05T09:58:02.000Z' },
      { id: '2', workflowId: 'od8h', mode: 'webhook', status: 'success', startedAt: '2026-10-05T09:00:00.000Z', stoppedAt: '2026-10-05T09:00:04.000Z' },
      { id: '1', workflowId: 'other', mode: 'webhook', finished: true, startedAt: '2026-10-05T08:00:00.000Z', stoppedAt: '2026-10-05T08:00:01.000Z' },
    ],
    'error log': [{ id: '7', occurred_at: '2026-10-05T09:50:47.073Z', workflow_id: 'od8h', workflow_name: 'Chat-Vis', level: 'error', error_message: 'x' }],
    'front-end error log': [],
  };
  const out = normalise(reply, '24h', NOW);
  expect(out.executions).toMatchObject({ count: 3, failed: 1 });
  // Name borrowed from the error log; most failures first.
  expect(out.executions.byWorkflow[0]).toMatchObject({ workflow: 'Chat-Vis', runs: 2, failures: 1, medianMs: 4000, lastStatus: 'error' });
  expect(out.executions.byWorkflow[1]).toMatchObject({ workflow: 'other', runs: 1, failures: 0, lastStatus: 'success' });
  expect(out.backendErrors.count).toBe(1);
  // An empty named group still shows, as zero.
  expect(out.frontendErrors).toMatchObject({ count: 0, recent: [] });
  expect(out.feedback).toBeNull();
});

test('the sample file covers all four tables', () => {
  const out = normalise(fixture, '24h', NOW);
  expect(out.backendErrors.count).toBeGreaterThan(0);
  expect(out.frontendErrors.recent[0]).toMatchObject({ webhook: 'presentation-plan', status: 502 });
  expect(out.feedback).toMatchObject({ up: 1, down: 2 });
  expect(out.feedback.byReason[0]).toEqual({ key: 'inaccurate', count: 2 });
  expect(out.reports).toMatchObject({ support: 1, opinions: 1, satisfaction: 5 });
});
