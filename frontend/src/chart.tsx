import { useEffect, useRef, useState } from 'react';

interface Point {
  at: string;
  v: number | null;
}

/** Gráfico de linha de série única (o título do cartão nomeia a série), com cruz e dica ao tocar/passar o mouse. */
export function LineChart({ points, unit, max, height = 140, color = '#4f46e5' }: { points: Point[]; unit: string; max?: number; height?: number; color?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const valid = points.filter((p) => p.v !== null) as { at: string; v: number }[];
  if (valid.length < 2) {
    return (
      <div ref={wrap} className="flex items-center justify-center rounded-xl bg-[#f8fafc] text-sm text-[#64748b]" style={{ height }}>
        Coletando dados… (uma amostra por minuto)
      </div>
    );
  }

  const padL = 34;
  const padR = 8;
  const padT = 8;
  const padB = 22;
  const w = width - padL - padR;
  const h = height - padT - padB;
  const top = max ?? Math.max(10, Math.ceil((Math.max(...valid.map((p) => p.v)) * 1.15) / 10) * 10);
  const t0 = new Date(valid[0].at).getTime();
  const t1 = new Date(valid[valid.length - 1].at).getTime();
  const x = (at: string) => padL + ((new Date(at).getTime() - t0) / Math.max(1, t1 - t0)) * w;
  const y = (v: number) => padT + h - (Math.min(v, top) / top) * h;
  const path = valid.map((p, i) => `${i ? 'L' : 'M'}${x(p.at).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const area = `${path}L${x(valid[valid.length - 1].at).toFixed(1)},${padT + h}L${padL},${padT + h}Z`;
  const ticks = [0, top / 2, top];
  const span = t1 - t0;
  const fmtT = (t: number) =>
    new Date(t).toLocaleString('pt-BR', span > 2 * 86400_000 ? { day: '2-digit', month: '2-digit' } : { hour: '2-digit', minute: '2-digit' });

  const onMove = (clientX: number) => {
    const rect = wrap.current!.getBoundingClientRect();
    const px = clientX - rect.left;
    let best = 0;
    let bestD = Infinity;
    valid.forEach((p, i) => {
      const d = Math.abs(x(p.at) - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(best);
  };

  const hp = hover !== null ? valid[hover] : null;
  const hx = hp ? x(hp.at) : 0;

  return (
    <div
      ref={wrap}
      className="relative w-full touch-pan-y select-none"
      onPointerMove={(e) => onMove(e.clientX)}
      onPointerDown={(e) => onMove(e.clientX)}
      onPointerLeave={() => setHover(null)}
    >
      <svg width={width} height={height} className="block max-w-full" role="img" aria-label={`Gráfico, último valor ${valid[valid.length - 1].v}${unit}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke="#eef2f7" strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#64748b">
              {Math.round(t)}
            </text>
          </g>
        ))}
        <path d={area} fill={color} opacity={0.08} />
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <text x={padL} y={height - 6} fontSize="11" fill="#64748b">
          {fmtT(t0)}
        </text>
        <text x={width - padR} y={height - 6} fontSize="11" fill="#64748b" textAnchor="end">
          {fmtT(t1)}
        </text>
        {hp && (
          <g>
            <line x1={hx} x2={hx} y1={padT} y2={padT + h} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={hx} cy={y(hp.v)} r={5} fill={color} stroke="#fff" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hp && (
        <div
          className="pointer-events-none absolute top-0 whitespace-nowrap rounded-lg bg-[#0f172a] px-2 py-1 text-xs font-semibold text-white shadow"
          style={{ left: Math.min(Math.max(hx - 50, 0), width - 110) }}
        >
          {hp.v}
          {unit} · {new Date(hp.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </div>
  );
}

/** Barra de uso (medidor) com o valor escrito ao lado. */
export function Meter({ pct, level }: { pct: number; level: 'ok' | 'warn' | 'error' | 'off' }) {
  const color = level === 'error' ? '#dc2626' : level === 'warn' ? '#d97706' : '#4f46e5';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[#eef2f7]" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  );
}
