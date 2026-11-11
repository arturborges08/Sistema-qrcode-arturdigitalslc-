import { useId, useState } from "react";
import { formatMoney } from "../lib/format";

/**
 * Gráfico de linha da receita diária (dados reais de /admin/overview). SVG puro, sem biblioteca.
 * Passar o mouse ou tocar mostra o valor do dia.
 */
export function RevenueChart({ data }: { data: { date: string; cents: number }[] }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = 180;
  const PAD = { l: 8, r: 8, t: 16, b: 24 };
  const max = Math.max(...data.map((d) => d.cents), 1);
  const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / Math.max(data.length - 1, 1);
  const y = (c: number) => PAD.t + (1 - c / max) * (H - PAD.t - PAD.b);
  // Curva suave (Catmull-Rom convertida para Bézier).
  const pts = data.map((d, i) => [x(i), y(d.cents)] as const);
  let line = pts.length ? `M${pts[0][0]},${pts[0][1]}` : "";
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, Math.min(H - PAD.b, p1[1] + (p2[1] - p0[1]) / 6)];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, Math.min(H - PAD.b, p2[1] - (p3[1] - p1[1]) / 6)];
    line += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  const area = pts.length ? `${line} L${x(data.length - 1)},${H - PAD.b} L${x(0)},${H - PAD.b} Z` : "";
  const label = (iso: string) => {
    const [, m, d] = iso.split("-");
    return `${d}/${m}`;
  };
  const total = data.reduce((s, d) => s + d.cents, 0);
  const h = hover !== null ? data[hover] : null;

  return (
    <figure className="relative">
      <figcaption className="sr-only">
        Receita por dia nos últimos {data.length} dias. Total {formatMoney(total)}.
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-44 w-full touch-none"
        preserveAspectRatio="none"
        onPointerLeave={() => setHover(null)}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const rel = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((rel - PAD.l) / (W - PAD.l - PAD.r)) * (data.length - 1));
          setHover(Math.max(0, Math.min(data.length - 1, i)));
        }}
        aria-hidden
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--color-brand-500)" stopOpacity="0.28" />
            <stop offset="1" stopColor="var(--color-brand-500)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + f * (H - PAD.t - PAD.b)} y2={PAD.t + f * (H - PAD.t - PAD.b)} stroke="var(--color-zinc-200)" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area} fill={`url(#${id})`} />
        <path d={line} fill="none" stroke="var(--color-brand-500)" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="var(--color-zinc-400)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {hover !== null && h && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-xl bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg"
          style={{ left: `${(x(hover) / W) * 100}%` }}
        >
          {label(h.date)} · {formatMoney(h.cents)}
        </div>
      )}
      <div className="mt-1 flex justify-between text-[11px] text-zinc-500">
        <span>{label(data[0]?.date ?? "")}</span>
        <span>{label(data[Math.floor(data.length / 2)]?.date ?? "")}</span>
        <span>{label(data.at(-1)?.date ?? "")}</span>
      </div>
    </figure>
  );
}
