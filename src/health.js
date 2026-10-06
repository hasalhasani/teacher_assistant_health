import { ENDPOINT_GROUPS } from './endpoints';

// ponytail: fixed thresholds; make them per-endpoint if a noisy workflow keeps reading as degraded.
const FAILING_RATE = 0.5;
const DEGRADED_RATE = 0.05;

export const STATUS = {
  healthy: { label: 'Healthy', icon: 'check_circle', tone: 'success' },
  degraded: { label: 'Degraded', icon: 'warning', tone: 'warning' },
  failing: { label: 'Failing', icon: 'error', tone: 'error' },
  idle: { label: 'No traffic', icon: 'schedule', tone: 'muted' },
  unregistered: { label: 'Not registered', icon: 'cancel', tone: 'error' },
};

const FAILED = ['error', 'crashed'];

// `endpoint` is one row from the stats reply, or undefined when n8n has no
// active webhook for a path the frontend calls.
export function classify(endpoint) {
  if (!endpoint || endpoint.active === false) return 'unregistered';
  const runs = Number(endpoint.runs) || 0;
  // Passive monitoring can't tell "fine but unused" from "broken and unused".
  if (runs === 0) return 'idle';
  const rate = (Number(endpoint.failures) || 0) / runs;
  if (rate >= FAILING_RATE) return 'failing';
  if (rate >= DEGRADED_RATE || FAILED.includes(endpoint.lastStatus)) return 'degraded';
  return 'healthy';
}

export const errorRate = (endpoint) => {
  const runs = Number(endpoint?.runs) || 0;
  return runs ? (Number(endpoint.failures) || 0) / runs : null;
};

// Joins the frontend's expected paths with what n8n reported. Returns the
// grouped rows plus any registered webhook the frontend list doesn't know.
export function buildRows(endpoints = []) {
  const byPath = new Map(endpoints.map((e) => [String(e.path).replace(/^\/+/, ''), e]));
  const groups = ENDPOINT_GROUPS.map((group) => ({
    name: group.name,
    rows: group.paths.map((path) => {
      const endpoint = byPath.get(path);
      byPath.delete(path);
      return { path, ...endpoint, status: classify(endpoint) };
    }),
  }));
  const unknown = [...byPath.entries()]
    .filter(([path]) => path !== 'dashboard-stats')
    .map(([path, endpoint]) => ({ ...endpoint, path, status: classify(endpoint) }));
  if (unknown.length) groups.push({ name: 'Not in the frontend list', rows: unknown });
  return groups;
}

export function countByStatus(groups) {
  const counts = { healthy: 0, degraded: 0, failing: 0, idle: 0, unregistered: 0 };
  groups.forEach((g) => g.rows.forEach((r) => { counts[r.status] += 1; }));
  return counts;
}
