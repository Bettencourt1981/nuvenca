import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8", className)}>
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path
        d="M10.5 22.5h11.2a4.3 4.3 0 0 0 .6-8.56 6 6 0 0 0-11.5-1.3A4.95 4.95 0 0 0 10.5 22.5Z"
        fill="white"
        fillOpacity="0.95"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-lg font-semibold tracking-tight", className)}>
      <LogoMark />
      Nuvenca
    </span>
  );
}
