import { useId } from "react";
import { cx } from "./ui";

/**
 * Marca: um "P" de Plaquinhas cuja curva é o "olho" de um QR Code. Mesmo desenho de public/favicon.svg.
 */
export function LogoMark({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 64 64" className={cx("shrink-0 drop-shadow-[0_4px_14px_rgb(124_77_255/0.45)]", className)} aria-hidden>
      <defs>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4a1d96" />
          <stop offset="1" stopColor="#1b0a3d" />
        </linearGradient>
        <linearGradient id={`${id}fg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbeaff" />
          <stop offset=".55" stopColor="#c4a1ff" />
          <stop offset="1" stopColor="#7c4dff" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${id}bg)`} />
      <rect x="1" y="1" width="62" height="62" rx="15" fill="none" stroke="#a78bfa" strokeOpacity=".45" strokeWidth="1.5" />
      <path d="M18 13h9.5l-6 38H12z" fill={`url(#${id}fg)`} />
      <rect x="25.5" y="15.5" width="24" height="21" rx="7" fill="none" stroke={`url(#${id}fg)`} strokeWidth="6" />
      <rect x="34" y="23" width="7" height="6" rx="1.8" fill="#e9d5ff" />
    </svg>
  );
}

export function Logo({ className, size = "md", tone = "auto" }: { className?: string; size?: "md" | "lg"; tone?: "auto" | "light" }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5 font-semibold tracking-tight", tone === "light" ? "text-[#fafafa]" : "text-zinc-900", className)}>
      <LogoMark className={size === "lg" ? "size-10" : "size-8"} />
      <span className={size === "lg" ? "text-2xl" : "text-[17px]"}>
        Plaqui<span className={tone === "light" ? "text-[#b79cff]" : "text-brand-600"}>nhas</span>
      </span>
    </span>
  );
}
