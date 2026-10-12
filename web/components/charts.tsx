"use client";
import { useId, useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

export interface Point { label: string; value: number }

const W = 600, H = 190, PAD = { t: 12, r: 8, b: 26, l: 28 };

/** Smooth monotone-ish path through points (horizontal control handles, no overshoot). */
function smooth(pts: [number, number][]) {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const cx = (x0 + x1) / 2;
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  return d;
}

/** Single-series area chart. One series => no legend; the card title names it. */
export function AreaChart({ data, unit = "" }: { data: Point[]; unit?: string }) {
  const gid = useId();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map(d => d.value));
  const top = Math.max(1, Math.ceil(max / 2) * 2); // headroom, even tick
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v: number) => PAD.t + ih - (v / top) * ih;
  const pts = data.map((d, i) => [x(i), y(d.value)] as [number, number]);
  const line = smooth(pts);
  const area = pts.length > 1 ? `${line} L${pts[pts.length - 1][0]},${y(0)} L${pts[0][0]},${y(0)} Z` : "";
  const ticks = [0, top / 2, top];
  const h = hover !== null ? data[hover] : null;

  return (
    <div className="relative mt-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Trend: ${data.map(d => `${d.label} ${d.value}`).join(", ")}`}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map(t => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth="1" />
            <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--color-muted)">{Number.isInteger(t) ? t : t.toFixed(1)}</text>
          </g>
        ))}
        {area && <path d={area} fill={`url(#${gid})`} />}
        {line && <path d={line} fill="none" stroke="var(--color-brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
        {data.length <= 12 && data.map((d, i) => (
          <circle key={d.label} cx={x(i)} cy={y(d.value)} r="4" fill="var(--color-brand)" stroke="#fff" strokeWidth="2" />
        ))}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={y(0)} stroke="var(--color-line-strong)" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(data[hover].value)} r="5" fill="var(--color-brand)" stroke="#fff" strokeWidth="2" />
          </g>
        )}
        {data.map((d, i) => (
          <text key={d.label} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--color-muted)">{d.label}</text>
        ))}
        {/* Hit targets wider than the marks */}
        {data.map((d, i) => {
          const w = iw / Math.max(1, data.length - 1);
          return (
            <rect key={d.label} x={x(i) - w / 2} y={PAD.t} width={w} height={ih + PAD.b} fill="transparent"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
          );
        })}
      </svg>
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-xl bg-white px-3 py-2 text-xs shadow-pop"
          style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(h.value) / H) * 100}%`, marginTop: -10 }}
        >
          <div className="text-muted">{h.label}</div>
          <div className="text-sm font-semibold text-ink">{h.value}{unit}</div>
        </div>
      )}
    </div>
  );
}

/** Change vs previous period: filled chip with sign + arrow (status colour is never the only cue), then a muted caption. */
export function Delta({ value, label }: { value: number; label?: string }) {
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <>
      <span className={`inline-flex items-center gap-0.5 rounded-lg px-2 py-1 text-xs font-semibold ${up ? "bg-good-soft text-good" : "bg-danger-soft text-danger"}`}>
        <Icon size={12} aria-hidden /> {up ? "+" : "−"}{Math.abs(value)}
      </span>
      {label && <span>{label.trim()}</span>}
    </>
  );
}
