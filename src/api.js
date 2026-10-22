import fixture from './fixture.json';
import { normalise } from './normalise';

// The sample rows are dated around this moment.
const FIXTURE_NOW = new Date('2026-10-05T10:00:00.000Z').getTime();

export class StatsError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // 'unreachable' | 'bad_reply' | 'signed_out'
  }
}

// The only request this app makes. The Worker (worker/index.js) checks the
// session and passes it on to the read-only stats workflow of that environment.
// Returns `(variant) => page data`, so switching variant re-filters without asking n8n again.
export async function fetchStats({ env, range, mock, signal }) {
  if (mock) return (variant) => normalise(fixture, range, FIXTURE_NOW, variant);

  let response;
  try {
    response = await fetch(`/api/stats?${new URLSearchParams({ env, range })}`, { method: 'POST', signal });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new StatsError('unreachable', 'n8n did not answer.');
  }
  if (response.status === 401) {
    // The file name, so it also resolves under `npm run dev`.
    window.location.assign('/login.html');
    throw new StatsError('signed_out', 'The session has ended.');
  }
  if (!response.ok) throw new StatsError('unreachable', `n8n answered HTTP ${response.status}.`);

  try {
    const reply = await response.json();
    const now = Date.now();
    normalise(reply, range, now); // throws on a reply that isn't rows
    return (variant) => normalise(reply, range, now, variant);
  } catch {
    throw new StatsError('bad_reply', 'The stats reply was not in the expected shape.');
  }
}
