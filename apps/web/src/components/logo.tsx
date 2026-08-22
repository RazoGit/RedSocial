import { cn } from "@/lib/utils";

export function Logo({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <svg
      role="img"
      aria-label="RedSocial"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
    >
      <rect width="64" height="64" rx="14" className="fill-emerald-600 dark:fill-emerald-500" />
      <path
        className="fill-primary-foreground"
        fillRule="evenodd"
        d="M16 12 H36 Q46 12 46 22 Q46 32 36 32 H30 L43 52 H31 L26 36 V52 H16 Z M26 19.5 H35 Q39 19.5 39 23 Q39 26.5 35 26.5 H26 Z"
      />
    </svg>
  );
}
