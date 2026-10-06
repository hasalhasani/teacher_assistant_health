import React, { useEffect, useRef, useState } from 'react';

// Chart colours live in app.css as --chart-* so they change in one place.
// The pairs were checked with the dataviz palette validator (colour-blind
// separation and contrast on the white surface).

const useWidth = () => {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
};

// The smallest round, even axis top that covers the data (2, 4, 6, 8, 10, 20, 40, 60 ...),
// so the midpoint tick is a whole number too.
const niceMax = (value) => {
  if (value <= 10) return Math.max(2, Math.ceil(value / 2) * 2);
  const power = 10 ** Math.floor(Math.log10(value));
  return [2, 4, 6, 8, 10].map((m) => m * power).find((m) => m >= value);
};

const bucketLabel = (start, bucketMs) => (bucketMs >= 24 * 3600 * 1000
  ? new Date(start).toLocaleDateString('en', { weekday: 'short', day: 'numeric' })
  : new Date(start).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' }));

const Legend = ({ series }) => (
  <ul className="legend">
    {series.map((s) => (
      <li key={s.key}><span className="swatch" style={{ background: s.color }} />{s.label}</li>
    ))}
  </ul>
);

const M = { top: 8, right: 8, bottom: 24, left: 36 };
const HEIGHT = 220;
const GAP = 2;      // surface gap between stacked segments
const RADIUS = 4;   // rounded data end; the baseline end stays square

// A column whose top corners are rounded and whose bottom is square.
const roundedTop = (x, y, w, h) => {
  const r = Math.min(RADIUS, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
};

// Stacked columns over time. `series`: [{ key, label, color, values[] }], first one at the bottom.
export function TimeBars({ starts, bucketMs, series, unit }) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState(null);
  const totals = starts.map((_, i) => series.reduce((sum, s) => sum + s.values[i], 0));
  const peak = Math.max(...totals);

  const innerW = Math.max(0, width - M.left - M.right);
  const innerH = HEIGHT - M.top - M.bottom;
  const band = innerW / starts.length;
  const barW = Math.max(2, Math.min(24, band - GAP));
  const top = niceMax(peak);
  const y = (value) => M.top + innerH - (value / top) * innerH;
  const labelEvery = Math.ceil(starts.length / Math.max(1, Math.floor(innerW / 80)));

  return (
    <div className="chart" ref={ref}>
      <Legend series={series} />
      {peak === 0 ? (
        <p className="empty chartEmpty">Nothing in this range.</p>
      ) : width > 0 && (
        <svg width={width} height={HEIGHT} role="img" aria-label={`${unit} over time; the tables below hold the same data`}>
          {[0, top / 2, top].map((tick) => (
            <g key={tick}>
              <line x1={M.left} x2={width - M.right} y1={y(tick)} y2={y(tick)} className="gridline" />
              <text x={M.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="axisText">{tick}</text>
            </g>
          ))}
          {starts.map((startMs, i) => {
            const x = M.left + i * band + (band - barW) / 2;
            let base = 0;
            const drawn = series.filter((s) => s.values[i] > 0);
            return (
              <g key={startMs}>
                {drawn.map((s, n) => {
                  const y0 = y(base);
                  base += s.values[i];
                  const y1 = y(base);
                  // Leave the surface gap above every segment except the top one.
                  const isTop = n === drawn.length - 1;
                  const h = Math.max(1, y0 - y1 - (isTop ? 0 : GAP));
                  return isTop
                    ? <path key={s.key} d={roundedTop(x, y0 - h, barW, h)} fill={s.color} />
                    : <rect key={s.key} x={x} y={y0 - h} width={barW} height={h} fill={s.color} />;
                })}
                {i % labelEvery === 0 && (
                  <text x={M.left + i * band + band / 2} y={HEIGHT - 6} textAnchor="middle" className="axisText">
                    {bucketLabel(startMs, bucketMs)}
                  </text>
                )}
                {/* The whole band is the hover and focus target, not just the bar. */}
                <rect
                  x={M.left + i * band} y={M.top} width={band} height={innerH}
                  className={`hit${active === i ? ' hitActive' : ''}`}
                  tabIndex={0}
                  aria-label={`${bucketLabel(startMs, bucketMs)}: ${series.map((s) => `${s.values[i]} ${s.label.toLowerCase()}`).join(', ')}`}
                  onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)} onBlur={() => setActive(null)}
                />
              </g>
            );
          })}
        </svg>
      )}
      {active !== null && peak > 0 && (
        <div
          className="tooltip"
          style={{ left: Math.min(Math.max(M.left + active * band + band / 2, 90), width - 90), top: Math.max(0, y(totals[active]) - 8) }}
        >
          <div className="tooltipTitle">{bucketLabel(starts[active], bucketMs)}</div>
          {series.map((s) => (
            <div key={s.key} className="tooltipRow">
              <span className="swatch" style={{ background: s.color }} />{s.label}<strong>{s.values[active]}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Horizontal bars, one per workflow: runs, with the failed part marked.
// Values are written at the end of each row, so nothing depends on hover.
export function WorkflowBars({ items, okColor, failColor }) {
  const peak = Math.max(1, ...items.map((w) => w.runs));
  return (
    <div className="chart">
      <Legend series={[{ key: 'ok', label: 'Succeeded or other', color: okColor }, { key: 'fail', label: 'Failed', color: failColor }]} />
      <ul className="hbars">
        {items.map((w) => (
          <li key={w.workflow} title={`${w.workflow}: ${w.runs} runs, ${w.failures} failed`}>
            <span className="hbarLabel">{w.workflow}</span>
            <span className="hbarTrack">
              {w.runs - w.failures > 0 && <span style={{ width: `${((w.runs - w.failures) / peak) * 100}%`, background: okColor }} />}
              {w.failures > 0 && <span style={{ width: `${(w.failures / peak) * 100}%`, background: failColor }} />}
            </span>
            <span className="hbarValue">{w.runs}{w.failures > 0 && <em> · {w.failures} failed</em>}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
