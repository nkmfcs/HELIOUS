import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("rounded-lg bg-surface", className)}>{children}</div>;
}

export function Group({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("overflow-hidden rounded-lg bg-surface", className)}>{children}</div>;
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 px-1 text-xs font-medium text-subtle">{children}</div>;
}

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "ok" | "danger" | "warn";
}) {
  const color =
    tone === "ok"
      ? "text-ok"
      : tone === "danger"
        ? "text-danger"
        : tone === "warn"
          ? "text-warn"
          : "text-fg";
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold leading-none tabular", color)}>{value}</div>
      {hint ? <div className="mt-1.5 text-xs text-subtle">{hint}</div> : null}
    </div>
  );
}

export function MetricRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "ok" | "danger";
}) {
  const color = tone === "ok" ? "text-ok" : tone === "danger" ? "text-danger" : "text-fg";
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <span className="text-sm text-muted">{label}</span>
      <span className={cn("text-sm font-semibold tabular", color)}>{value}</span>
    </div>
  );
}
