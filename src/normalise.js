// The stats webhook answers with raw table rows in one flat array. This turns
// them into what the page renders. Rows are told apart by their columns, so
// the workflow can return rows from any of the four tables, in any order:
//   error_log            -> has error_message
//   frontend_error_log   -> has received_at and source
//   feedback             -> has vote
//   user_reports         -> has report_id and kind
//   n8n executions       -> has startedAt and workflowId (n8n's "Get many executions")
const HOURS = { '1h': 1, '24h': 24, '7d': 168 };
const RECENT = 50;

const stripWebhook = (url) => (url ? String(url).replace(/^.*\/webhook\//, '') : null);
const text = (value) => (value ? String(value).slice(0, 300) : null);

const KINDS = [
  {
    key: 'backend',
    is: (r) => 'error_message' in r,
    map: (r) => ({
      time: r.occurred_at,
      level: r.level,
      workflow: r.workflow_name || r.workflow_id,
      node: r.node_name,
      message: text(r.error_message),
      executionId: r.execution_id,
      environment: r.environment,
    }),
  },
  {
    key: 'frontend',
    is: (r) => 'received_at' in r && 'source' in r,
    map: (r) => ({
      time: r.received_at,
      source: r.source,
      message: text(r.message),
      route: r.route,
      webhook: stripWebhook(r.raw_payload?.webhook),
      status: r.raw_payload?.status ?? null,
      appVariant: r.app_variant,
    }),
  },
  {
    key: 'feedback',
    is: (r) => 'vote' in r,
    map: (r) => ({
      time: r.timestamp,
      vote: r.vote,
      reasonList: Array.isArray(r.reasons) ? r.reasons : [],
      reasons: Array.isArray(r.reasons) ? r.reasons.join(', ') : null,
      comment: text(r.comment),
      variant: r.variant,
    }),
  },
  {
    key: 'reports',
    is: (r) => 'report_id' in r && 'kind' in r,
    map: (r) => ({
      time: r.timestamp,
      kind: r.kind,
      satisfaction: r.satisfaction,
      text: text(r.description || r.comment),
      userName: r.user_name,
      variant: r.variant,
    }),
  },
  {
    key: 'executions',
    // Shape documented for n8n's executions API; not yet seen with real rows.
    is: (r) => 'startedAt' in r && 'workflowId' in r,
    map: (r) => ({
      time: r.startedAt,
      workflowId: r.workflowId,
      workflowName: r.workflowName || r.workflowData?.name || null,
      status: r.status || (r.finished ? 'success' : 'error'),
      ms: r.stoppedAt ? new Date(r.stoppedAt) - new Date(r.startedAt) : null,
    }),
  },
];

// When the reply names its groups ("error log", "front-end error log", ...),
// the name tells which table an EMPTY group belongs to, so the page can say
// "none" for it instead of hiding the section.
const NAMES = { backend: /^(?!.*front).*error/i, frontend: /front/i, feedback: /feedback/i, reports: /report|support/i, executions: /execution/i };

const FAILED = ['error', 'crashed'];
const MINUTE = 60 * 1000;
// range -> [number of chart buckets, bucket length]
const BUCKETS = { '1h': [12, 5 * MINUTE], '24h': [24, 60 * MINUTE], '7d': [7, 24 * 60 * MINUTE] };
const median = (values) => {
  const sorted = values.filter((v) => v !== null).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
};

const countBy = (rows, pick) => {
  const counts = new Map();
  rows.forEach((row) => [pick(row)].flat().filter(Boolean).forEach((key) => counts.set(key, (counts.get(key) || 0) + 1)));
  return [...counts].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count).slice(0, 8);
};

// `now` is injectable so sample data and tests are not tied to today's date.
export function normalise(reply, range, now = Date.now()) {
  if (!reply || typeof reply !== 'object') throw new Error('The reply is not a list of rows');

  // The workflow returns every row it has; the range is applied here.
  const since = now - (HOURS[range] || 24) * 3600 * 1000;
  const sets = { backend: null, frontend: null, feedback: null, reports: null, executions: null };
  const workflowNames = new Map();
  let totalRows = 0;
  // Rows can arrive bare, or nested however the workflow groups them: an
  // Aggregate node answers [{ data: [rows] }], a Merge may answer
  // [{ errors: [rows], feedback: [rows] }]. Anything that isn't a known row is
  // searched for rows inside it.
  const collect = (value) => {
    if (Array.isArray(value)) { value.forEach(collect); return; }
    if (!value || typeof value !== 'object') return;
    // A workflow from n8n's "Get many workflows": only its name is used.
    if ('id' in value && 'name' in value && 'active' in value) { workflowNames.set(value.id, value.name); return; }
    const kind = KINDS.find((k) => k.is(value));
    if (!kind) {
      for (const [name, inner] of Object.entries(value)) {
        if (Array.isArray(inner)) {
          const named = Object.keys(NAMES).find((key) => NAMES[key].test(name));
          if (named) sets[named] ||= [];
        }
        collect(inner);
      }
      return;
    }
    // Executions carry only a workflow id; the error log knows some of the names.
    if (value.workflow_id && value.workflow_name) workflowNames.set(value.workflow_id, value.workflow_name);
    totalRows += 1;
    sets[kind.key] ||= [];
    const mapped = kind.map(value);
    const at = new Date(mapped.time).getTime();
    if (kind.key === 'executions') { fetchedExecutions += 1; oldestExecution = Math.min(oldestExecution, at); }
    if (at >= since) sets[kind.key].push(mapped);
  };
  let fetchedExecutions = 0;
  let oldestExecution = Infinity;
  collect(reply);
  Object.values(sets).forEach((set) => set?.sort((a, b) => new Date(b.time) - new Date(a.time)));

  // A section is null when the reply had no rows of that table at all, so the
  // page can hide it instead of showing a misleading zero.
  const { backend, frontend, feedback, reports, executions } = sets;

  const byWorkflow = new Map();
  executions?.forEach((e) => {
    const w = byWorkflow.get(e.workflowId)
      || { workflow: e.workflowName || workflowNames.get(e.workflowId) || e.workflowId, runs: 0, failures: 0, lastRunAt: null, lastStatus: null, durations: [] };
    w.runs += 1;
    if (FAILED.includes(e.status)) w.failures += 1;
    // Already sorted newest first, so the first one seen is the latest run.
    if (!w.lastRunAt) { w.lastRunAt = e.time; w.lastStatus = e.status; }
    w.durations.push(e.ms);
    byWorkflow.set(e.workflowId, w);
  });

  // Counts per time bucket, oldest first, for the charts.
  const [bucketCount, bucketMs] = BUCKETS[range] || BUCKETS['24h'];
  const start = now - bucketCount * bucketMs;
  const tally = (rows, accept = () => true) => {
    const counts = new Array(bucketCount).fill(0);
    rows?.forEach((row) => {
      const index = Math.floor((new Date(row.time).getTime() - start) / bucketMs);
      if (index >= 0 && index < bucketCount && accept(row)) counts[index] += 1;
    });
    return counts;
  };
  const series = {
    bucketMs,
    starts: Array.from({ length: bucketCount }, (_, i) => start + i * bucketMs),
    succeeded: tally(executions, (e) => e.status === 'success'),
    failed: tally(executions, (e) => FAILED.includes(e.status)),
    backend: tally(backend),
    frontend: tally(frontend),
  };

  const down = feedback?.filter((f) => f.vote === 'down');
  const opinions = reports?.filter((r) => r.kind === 'opinion' && r.satisfaction != null);
  return {
    generatedAt: new Date(now).toISOString(),
    range,
    totalRows,
    series,
    backendErrors: backend && {
      count: backend.length,
      recent: backend.slice(0, RECENT),
      byWorkflow: countBy(backend, (r) => r.workflow),
    },
    frontendErrors: frontend && {
      count: frontend.length,
      recent: frontend.slice(0, RECENT),
      byRoute: countBy(frontend, (r) => r.route),
      byWebhook: countBy(frontend, (r) => r.webhook),
    },
    feedback: feedback && {
      up: feedback.filter((f) => f.vote === 'up').length,
      down: down.length,
      recent: down.slice(0, RECENT),
      byReason: countBy(down, (r) => r.reasonList),
    },
    executions: executions && {
      count: executions.length,
      failed: executions.filter((e) => FAILED.includes(e.status)).length,
      succeeded: executions.filter((e) => e.status === 'success').length,
      medianMs: median(executions.map((e) => e.ms)),
      // n8n hands back its newest N executions. If even the oldest of them is
      // inside the range, the range holds more runs than were counted.
      capped: fetchedExecutions > 0 && oldestExecution > since ? fetchedExecutions : null,
      byWorkflow: [...byWorkflow.values()]
        .map(({ durations, ...w }) => ({ ...w, medianMs: median(durations) }))
        .sort((a, b) => b.failures - a.failures || b.runs - a.runs),
    },
    reports: reports && {
      support: reports.filter((r) => r.kind === 'support').length,
      opinions: opinions.length,
      satisfaction: opinions.length ? Math.round((opinions.reduce((sum, r) => sum + Number(r.satisfaction), 0) / opinions.length) * 10) / 10 : null,
      recent: reports.slice(0, RECENT),
    },
  };
}
