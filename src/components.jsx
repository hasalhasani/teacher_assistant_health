import React from 'react';
import { STATUS, errorRate } from './health';

// Material Symbols Rounded, the frontend's subset. Decorative unless `label` is given.
export const Icon = ({ name, spin = false, label }) => (
  <i
    className={`material-symbols-rounded${spin ? ' icon-spin' : ''}`}
    aria-hidden={label ? undefined : 'true'}
    role={label ? 'img' : undefined}
    aria-label={label}
  >
    {name}
  </i>
);

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
export const timeAgo = (iso) => {
  if (!iso) return 'Never';
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  if (Number.isNaN(seconds)) return 'Unknown';
  const abs = Math.abs(seconds);
  if (abs < 60) return relative.format(seconds, 'second');
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), 'hour');
  return relative.format(Math.round(seconds / 86400), 'day');
};
export const duration = (ms) => {
  if (ms === null || ms === undefined) return '–';
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
};
export const percent = (rate) => (rate === null ? '–' : `${(rate * 100).toFixed(rate > 0 && rate < 0.1 ? 1 : 0)}%`);
const clock = (iso) => (iso ? new Date(iso).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' }) : '');

export function Segmented({ label, options, value, onChange }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={o.id === value} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const Tile = ({ icon, tone = 'muted', value, label }) => (
  <div className="tile">
    <span className={`tileIcon tone-${tone}`}><Icon name={icon} /></span>
    <span className="tileValue">{value}</span>
    <span className="tileLabel">{label}</span>
  </div>
);

// Icon plus text, so status never depends on colour alone.
export const StatusBadge = ({ status }) => {
  const s = STATUS[status];
  return <span className={`badge tone-${s.tone}`}><Icon name={s.icon} />{s.label}</span>;
};

export function EndpointsTable({ groups }) {
  return (
    <div className="tableScroll">
      <table>
        <thead>
          <tr>
            <th scope="col">Endpoint</th>
            <th scope="col">Workflow</th>
            <th scope="col">Status</th>
            <th scope="col">Last run</th>
            <th scope="col" className="num">Runs</th>
            <th scope="col" className="num">Errors</th>
            <th scope="col" className="num">Median</th>
            <th scope="col" className="num">95th pct.</th>
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody key={group.name}>
            <tr className="groupRow"><th scope="colgroup" colSpan={8}>{group.name}</th></tr>
            {group.rows.map((row) => (
              <tr key={row.path}>
                <td className="mono">/{row.path}</td>
                <td>{row.workflowName || '–'}</td>
                <td><StatusBadge status={row.status} /></td>
                <td title={clock(row.lastRunAt)}>{timeAgo(row.lastRunAt)}</td>
                <td className="num">{row.runs ?? '–'}</td>
                <td className="num">{percent(errorRate(row))}</td>
                <td className="num">{duration(row.p50Ms)}</td>
                <td className="num">{duration(row.p95Ms)}</td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

// `columns`: [{ key, label, mono?, render? }]
export function ErrorsTable({ rows = [], columns, empty }) {
  if (!rows.length) return <p className="empty">{empty}</p>;
  return (
    <div className="tableScroll">
      <table>
        <thead>
          <tr>{columns.map((c) => <th scope="col" key={c.key}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row.time}-${i}`}>
              {columns.map((c) => (
                <td key={c.key} className={c.mono ? 'mono' : undefined} title={c.key === 'time' ? clock(row.time) : undefined}>
                  {c.key === 'time' ? timeAgo(row.time) : (row[c.key] ?? '–')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const Counts = ({ title, items = [] }) => (
  <div className="counts">
    <h3>{title}</h3>
    {items.length ? (
      <ol>
        {items.map((item) => (
          <li key={item.key}><span className="mono">{item.key || '(none)'}</span><span className="num">{item.count}</span></li>
        ))}
      </ol>
    ) : <p className="empty">Nothing in this range.</p>}
  </div>
);
