import { useId } from "react";
import { cx } from "./ui";

/** Marca: cantos de QR Code + ondas de aproximação (NFC). Mesmo desenho do favicon. */
export function LogoMark({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 32 32" className={cx("shrink-0", className)} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7a63ff" />
          <stop offset="1" stopColor="#4c33cf" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${id})`} />
      <g fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 13V9.5A1.5 1.5 0 0 1 9.5 8H13" />
        <path d="M8 19v3.5A1.5 1.5 0 0 0 9.5 24H13" />
        <path d="M19 24h3.5a1.5 1.5 0 0 0 1.5-1.5V19" />
      </g>
      <rect x="12.5" y="12.5" width="7" height="7" rx="1.6" fill="#fff" />
      <g fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
        <path d="M19.5 6.5a5.5 5.5 0 0 1 6 6" />
        <path d="M19.5 9.6a2.6 2.6 0 0 1 2.9 2.9" />
      </g>
    </svg>
  );
}

export function Logo({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  return (
    <span className={cx("inline-flex items-center gap-2 font-semibold tracking-tight text-zinc-900", className)}>
      <LogoMark className={size === "lg" ? "size-10" : "size-7"} />
      <span className={size === "lg" ? "text-2xl" : "text-base"}>
        Plaqui<span className="text-brand-600">nhas</span>
      </span>
    </span>
  );
}
