import { cn } from "@/lib/utils";

/** Page title in the display face (Rubik Black, uppercase), same as the landing page headings. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 pb-8 lg:flex-row lg:items-end lg:justify-between", className)}>
      <div className="min-w-0 flex-1 space-y-2">
        {eyebrow ? (
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
            <span className="size-1.5 rounded-full bg-primary" /> {eyebrow}
          </div>
        ) : null}
        <h1 className="font-display text-3xl leading-[0.95] font-black tracking-tight uppercase sm:text-4xl">{title}</h1>
        {description ? <p className="max-w-2xl text-pretty text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 lg:max-w-[50%] lg:shrink-0 lg:justify-end">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-3xl bg-surface p-3", className)}>
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 px-6 py-14 text-center">
        {icon ? <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground [&_svg]:size-5">{icon}</div> : null}
        <h3 className="font-display text-lg font-bold">{title}</h3>
        {children ? <div className="mt-1.5 max-w-sm text-sm text-pretty text-muted-foreground">{children}</div> : null}
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </div>
  );
}

const TILE_TONE = {
  primary: "bg-secondary text-secondary-foreground",
  lilac: "bg-lilac-soft text-lilac-foreground",
  sun: "bg-sun-soft text-sun-foreground",
  mint: "bg-mint-soft text-mint-foreground",
  rose: "bg-rose-soft text-rose-foreground",
} as const;

export function StatTile({
  label,
  value,
  hint,
  accent,
  icon,
  tone = "primary",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  /** Kept for existing callers: colours the value in the primary blue. */
  accent?: boolean;
  icon?: React.ReactNode;
  tone?: keyof typeof TILE_TONE;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/5 sm:flex-row sm:gap-4 sm:p-5">
      {icon ? <span className={cn("grid size-11 shrink-0 place-items-center rounded-2xl [&_svg]:size-5", TILE_TONE[tone])}>{icon}</span> : null}
      <div className="min-w-0">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className={cn("mt-1 font-display text-2xl leading-none font-bold tabular sm:text-3xl", accent && "text-primary")}>{value}</div>
        {hint ? <div className="mt-1.5 text-xs text-muted-foreground">{hint}</div> : null}
      </div>
    </div>
  );
}

/** Grey panel that holds white cards: the main layout block of the design system. */
export function Panel({ className, children, tone = "surface" }: { className?: string; children: React.ReactNode; tone?: "surface" | "sage" | "lilac" | "sun" }) {
  const bg = { surface: "bg-surface", sage: "bg-sage", lilac: "bg-lilac", sun: "bg-sun" }[tone];
  return <div className={cn("rounded-3xl p-3 sm:p-4", bg, className)}>{children}</div>;
}
