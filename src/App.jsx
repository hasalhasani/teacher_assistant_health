import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchStats } from './api';
import { ENVIRONMENTS, RANGES } from './endpoints';
import { buildRows, countByStatus } from './health';
import { Counts, EndpointsTable, ErrorsTable, Icon, Segmented, Tile, duration, percent, timeAgo } from './components';
import { TimeBars, WorkflowBars } from './charts';

// The stats workflow is asked once an hour while the page is open, and on Refresh.
const REFRESH_MS = 60 * 60 * 1000;
const mock = new URLSearchParams(window.location.search).has('mock');

// Storage can throw (private windows, blocked site data); the page works without it.
const read = (store, key) => { try { return store.getItem(key); } catch { return null; } };
const write = (store, key, value) => { try { store.setItem(key, value); } catch { /* not remembered */ } };

const BACKEND_COLUMNS = [
  { key: 'time', label: 'When' },
  { key: 'level', label: 'Level' },
  { key: 'workflow', label: 'Workflow' },
  { key: 'node', label: 'Node' },
  { key: 'message', label: 'Message' },
  { key: 'executionId', label: 'Execution', mono: true },
  { key: 'environment', label: 'Environment' },
];
const FRONTEND_COLUMNS = [
  { key: 'time', label: 'When' },
  { key: 'source', label: 'Source' },
  { key: 'message', label: 'Message' },
  { key: 'route', label: 'Page', mono: true },
  { key: 'webhook', label: 'Endpoint', mono: true },
  { key: 'status', label: 'HTTP' },
  { key: 'appVariant', label: 'Variant' },
];

const FEEDBACK_COLUMNS = [
  { key: 'time', label: 'When' },
  { key: 'reasons', label: 'Reasons' },
  { key: 'comment', label: 'Comment' },
  { key: 'variant', label: 'Variant' },
];
const REPORT_COLUMNS = [
  { key: 'time', label: 'When' },
  { key: 'kind', label: 'Type' },
  { key: 'satisfaction', label: 'Rating (1–5)' },
  { key: 'text', label: 'What they wrote' },
  { key: 'userName', label: 'From' },
  { key: 'variant', label: 'Variant' },
];

const EXECUTION_COLUMNS = [
  { key: 'workflow', label: 'Workflow' },
  { key: 'runs', label: 'Runs' },
  { key: 'failures', label: 'Failed' },
  { key: 'rate', label: 'Error rate' },
  { key: 'median', label: 'Median time' },
  { key: 'last', label: 'Last run' },
  { key: 'lastStatus', label: 'Last result' },
];
const executionRows = (rows = []) => rows.map((w) => ({
  ...w,
  rate: percent(w.runs ? w.failures / w.runs : null),
  median: duration(w.medianMs),
  last: timeAgo(w.lastRunAt),
}));

const COLOR = { run: 'var(--chart-run)', failed: 'var(--chart-failed)', frontend: 'var(--chart-frontend)' };
const RANGE_WORDS = { '1h': 'the last hour', '24h': 'the last 24 hours', '7d': 'the last 7 days' };

const PROBLEMS = {
  unreachable: 'n8n did not answer, so nothing below is current.',
  bad_reply: 'n8n answered, but not with a list of table rows. Check what the dashboard-stats workflow returns.',
};

export default function App() {
  const [env, setEnv] = useState(() => read(localStorage, 'dashboard.env') || 'dev');
  const [range, setRange] = useState('24h');
  const [state, setState] = useState({ loading: false, data: null, error: null, loadedAt: null });
  const [tab, setTab] = useState(null);

  const base = ENVIRONMENTS.find((e) => e.id === env)?.base;

  const load = useCallback(async (signal) => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await fetchStats({ base, range, mock, signal });
      setState({ loading: false, data, error: null, loadedAt: new Date() });
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error('[Dashboard] stats failed:', error);
      // Keep the last good data on screen, marked stale by the banner.
      setState((s) => ({ ...s, loading: false, error }));
    }
  }, [base, range]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    const timer = setInterval(() => load(controller.signal), REFRESH_MS);
    return () => { controller.abort(); clearInterval(timer); };
  }, [load]);

  const groups = useMemo(() => buildRows(state.data?.endpoints), [state.data]);
  const counts = useMemo(() => countByStatus(groups), [groups]);
  const { data, error, loading, loadedAt } = state;

  // One table at a time, so the detail sits under the charts without a long scroll.
  const tables = !data ? [] : [
    data.executions && {
      id: 'workflows', label: 'Workflows', count: data.executions.byWorkflow.length,
      node: <ErrorsTable rows={executionRows(data.executions.byWorkflow)} columns={EXECUTION_COLUMNS} empty="The workflow returned no executions for this range." />,
    },
    data.backendErrors && {
      id: 'backend', label: 'Backend errors', count: data.backendErrors.count,
      node: <ErrorsTable rows={data.backendErrors.recent} columns={BACKEND_COLUMNS} empty="No backend errors in this range." />,
    },
    data.frontendErrors && {
      id: 'frontend', label: 'Frontend errors', count: data.frontendErrors.count,
      node: <ErrorsTable rows={data.frontendErrors.recent} columns={FRONTEND_COLUMNS} empty="No frontend errors in this range." />,
    },
    data.reports && {
      id: 'reports', label: 'Support and opinions', count: data.reports.recent.length,
      node: <ErrorsTable rows={data.reports.recent} columns={REPORT_COLUMNS} empty="Nothing was sent in this range." />,
    },
    data.feedback && {
      id: 'feedback', label: 'Thumbs down', count: data.feedback.down,
      node: <ErrorsTable rows={data.feedback.recent} columns={FEEDBACK_COLUMNS} empty="No answers were marked down in this range." />,
    },
    data.endpoints && { id: 'endpoints', label: 'Endpoints', count: data.endpoints.length, node: <EndpointsTable groups={groups} /> },
  ].filter(Boolean);
  const table = tables.find((t) => t.id === tab) || tables[0];

  return (
    <div className="page">
      <header className="header">
        <div>
          <h1>Teaching Assistant health</h1>
        </div>
        <div className="controls">
          <Segmented label="Environment" options={ENVIRONMENTS} value={env} onChange={(id) => { write(localStorage, 'dashboard.env', id); setEnv(id); }} />
          <Segmented label="Time range" options={RANGES} value={range} onChange={setRange} />
          <button type="button" className="tonal" onClick={() => load()} disabled={loading}>
            <Icon name={loading ? 'progress_activity' : 'refresh'} spin={loading} /> Refresh
          </button>
        </div>
      </header>

      <p className="updated" role="status">
        {mock && 'Sample data. '}
        {loading && !data ? 'Loading…' : loadedAt ? `Updated ${loadedAt.toLocaleTimeString('en', { timeStyle: 'short' })}.` : ''}
      </p>

      {error && (
        <div className="banner" role="alert"><Icon name="error" /> {PROBLEMS[error.kind] || error.message}</div>
      )}

      {data && (
        <>
          {data.totalRows === 0 && <p className="empty">The workflow returned no rows.</p>}

          {/* Each tile and section appears only when the reply held rows from its table. */}
          <section className="tiles" aria-label="Summary">
            {data.endpoints && (
              <>
                <Tile icon="check_circle" tone="success" value={counts.healthy} label="Healthy" />
                <Tile icon="warning" tone="warning" value={counts.degraded} label="Degraded" />
                <Tile icon="error" tone="error" value={counts.failing + counts.unregistered} label="Failing or not registered" />
                <Tile icon="schedule" value={counts.idle} label="No traffic" />
              </>
            )}
            {data.executions && (
              <>
                <Tile icon="sync" tone="info" value={data.executions.count} label="Executions" />
                <Tile icon="check_circle" tone="success" value={percent(data.executions.count ? data.executions.succeeded / data.executions.count : null)} label="Succeeded" />
                <Tile icon="error" tone="error" value={data.executions.failed} label="Failed executions" />
                <Tile icon="schedule" value={duration(data.executions.medianMs)} label="Median run time" />
              </>
            )}
            {data.backendErrors && <Tile icon="database" tone="error" value={data.backendErrors.count} label="Backend errors logged" />}
            {data.frontendErrors && <Tile icon="laptop" tone="warning" value={data.frontendErrors.count} label="Frontend errors logged" />}
            {data.feedback && <Tile icon="thumb_down" tone="warning" value={data.feedback.down} label={`Thumbs down (${data.feedback.up} up)`} />}
            {data.reports && <Tile icon="support" tone="info" value={data.reports.support} label="Support requests" />}
            {data.reports && <Tile icon="star" value={data.reports.satisfaction ?? '–'} label={`Satisfaction, of 5 (${data.reports.opinions} opinions)`} />}
          </section>

          {data.executions?.capped && (
            <p className="hint">
              Only the newest {data.executions.capped} executions were returned, and they do not reach back to the start of this range, so the execution numbers are undercounted.
            </p>
          )}

          {/* Desktop layout: a wide chart on the left, its breakdown on the right. */}
          <div className="deskGrid">
            {data.executions && (
              <section className="card">
                <h2>Executions over time</h2>
                <p className="hint">Runs started in {RANGE_WORDS[data.range]}.</p>
                <TimeBars
                  unit="Executions"
                  starts={data.series.starts}
                  bucketMs={data.series.bucketMs}
                  series={[
                    { key: 'succeeded', label: 'Succeeded', color: COLOR.run, values: data.series.succeeded },
                    { key: 'failed', label: 'Failed', color: COLOR.failed, values: data.series.failed },
                  ]}
                />
              </section>
            )}
            {data.executions && (
              <section className="card">
                <h2>Executions by workflow</h2>
                <p className="hint">Most failures first.</p>
                {data.executions.byWorkflow.length
                  ? <WorkflowBars items={data.executions.byWorkflow.slice(0, 9)} okColor={COLOR.run} failColor={COLOR.failed} />
                  : <p className="empty">Nothing in this range.</p>}
              </section>
            )}
            {(data.backendErrors || data.frontendErrors) && (
              <section className="card">
                <h2>Errors over time</h2>
                <p className="hint">Rows written to the two error logs in {RANGE_WORDS[data.range]}.</p>
                <TimeBars
                  unit="Errors"
                  starts={data.series.starts}
                  bucketMs={data.series.bucketMs}
                  series={[
                    { key: 'backend', label: 'Backend', color: COLOR.run, values: data.series.backend },
                    { key: 'frontend', label: 'Frontend', color: COLOR.frontend, values: data.series.frontend },
                  ]}
                />
              </section>
            )}
            {(data.backendErrors || data.frontendErrors) && (
              <section className="card">
                <h2>Where errors come from</h2>
                <div className="countsCol">
                  {data.backendErrors && <Counts title="Backend, by workflow" items={data.backendErrors.byWorkflow.slice(0, 4)} />}
                  {data.frontendErrors && <Counts title="Frontend, by page" items={data.frontendErrors.byRoute.slice(0, 3)} />}
                  {data.frontendErrors && <Counts title="Frontend, by endpoint" items={data.frontendErrors.byWebhook.slice(0, 3)} />}
                  {data.feedback && <Counts title="Thumbs down, by reason" items={data.feedback.byReason.slice(0, 3)} />}
                </div>
              </section>
            )}
          </div>

          {table && (
            <section className="card">
              <div className="tableHead">
                <h2>Details</h2>
                <Segmented label="Table" options={tables.map((t) => ({ id: t.id, label: `${t.label} (${t.count})` }))} value={table.id} onChange={setTab} />
              </div>
              {table.node}
            </section>
          )}
        </>
      )}
    </div>
  );
}
