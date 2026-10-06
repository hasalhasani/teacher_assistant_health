import fixture from './fixture.json';
import { normalise } from './normalise';

// The sample rows are dated around this moment.
const FIXTURE_NOW = new Date('2026-10-05T10:00:00.000Z').getTime();

export class StatsError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // 'unreachable' | 'bad_reply'
  }
}

// The only request this app makes: a POST that runs the read-only stats workflow.
export async function fetchStats({ base, range, mock, signal }) {
  if (mock) return normalise(fixture, range, FIXTURE_NOW);

  let response;
  try {
    // A bare POST, with the range in the URL. Adding a JSON body would make the
    // browser send a CORS pre-check first, and n8n only answers that pre-check
    // for localhost, so a hosted copy of this page would be blocked.
    response = await fetch(`${base}/webhook/dashboard-stats?range=${encodeURIComponent(range)}`, { method: 'POST', signal });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new StatsError('unreachable', 'n8n did not answer.');
  }
  if (!response.ok) throw new StatsError('unreachable', `n8n answered HTTP ${response.status}.`);

  try {
    return normalise(await response.json(), range);
  } catch {
    throw new StatsError('bad_reply', 'The stats reply was not in the expected shape.');
  }
}
