import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="flex size-7 items-center justify-center rounded-md bg-[var(--color-primary)] text-[var(--color-primary-fg)]">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="6" r="2.2" />
          <circle cx="6" cy="18" r="2.2" />
          <circle cx="18" cy="12" r="2.2" />
          <path d="M6 8.2v7.6M8.2 6h4.2a3.4 3.4 0 0 1 3.4 3.4v.4M8.2 18h4.2a3.4 3.4 0 0 0 3.4-3.4v-.4" />
        </svg>
      </span>
      <span className="text-sm font-semibold tracking-tight text-[var(--color-fg)]">
        GitFlow <span className="text-[var(--color-fg-muted)]">Automator</span>
      </span>
    </div>
  );
}
