import { cn } from "@/lib/utils";

/**
 * Label + control + hint, stacked. Pass `error` to show what's wrong under the control (it replaces
 * the hint); give the control `aria-invalid` and `aria-describedby={errorId(htmlFor)}` so screen
 * readers announce it too.
 */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  className,
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? <FieldError id={htmlFor ? errorId(htmlFor) : undefined} message={error} /> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** The id a control points aria-describedby at for its error message. */
export const errorId = (controlId: string) => `${controlId}-error`;

/** A field's error message, for controls that aren't wrapped in a Field. */
export function FieldError({ id, message }: { id?: string; message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

/** Props that mark a control invalid and link it to its error message. */
export const invalid = (controlId: string, error: string | null | undefined) =>
  error ? ({ "aria-invalid": true, "aria-describedby": errorId(controlId) } as const) : {};

/** A native <select> in the input style: reliable in forms and on phones. */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-control border border-input bg-card px-3.5 text-sm shadow-xs outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring/15 disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

/** A white card inside a Panel, the standard content block. */
export function Section({ title, description, actions, className, children }: { title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-2xl bg-card p-5 shadow-card ring-1 ring-foreground/5", className)}>
      {title || actions ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <h2 className="font-display text-lg font-bold">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** A thin progress bar. */
export function Progress({ value, className, tone = "primary" }: { value: number; className?: string; tone?: "primary" | "mint" }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-surface", className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-[width]", tone === "mint" ? "bg-mint" : "bg-primary")} style={{ width: `${pct}%` }} />
    </div>
  );
}
