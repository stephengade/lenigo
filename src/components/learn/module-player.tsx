import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, ClipboardCheck, FileText, Hammer, Lock, PlayCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/button-link";
import { Progress } from "@/components/form-field";
import { formatMinutes } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { learnPath, type ModuleStep } from "@/lib/module-steps";
import type { StepContext } from "@/app/c/[community]/[space]/learn/[track]/[module]/load";

const KIND_LABEL = { lesson: "Lesson", quiz: "Quiz", project: "Project" } as const;

/**
 * The course-player frame around one step: a header, the step itself, a footer whose
 * "Mark as completed" only unlocks once the server has recorded the step as done, and the
 * module's course content on the side.
 */
export function ModulePlayer({ ctx, children }: { ctx: StepContext; children: React.ReactNode }) {
  const { w, steps, step, index, base, moduleBase } = ctx;
  const position = steps.filter((st) => st.kind !== "project").length;
  const label = step.kind === "project" ? "Capstone project" : `${KIND_LABEL[step.kind]} · step ${index + 1} of ${position}`;

  return (
    <div className="space-y-5">
      <Link href={w.preview && !w.enrollment ? `${base}/roadmap?track=${w.track.id}` : `${base}/roadmap`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Roadmap
      </Link>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <header className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {w.track.title} · {w.level.title} · {w.module.title}
            </p>
            <h1 className="font-display text-2xl font-bold sm:text-3xl">{step.title}</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{label}</span>
              {step.done && step.tracked ? (
                <Badge variant="mint">
                  <Check className="size-3" strokeWidth={3} /> Completed
                </Badge>
              ) : null}
              {w.placedOut ? <Badge variant="lilac">Placed out: no points here</Badge> : null}
              {w.preview ? <Badge variant="muted">Preview</Badge> : null}
            </div>
          </header>

          {step.open ? children : <LockedStep steps={steps} index={index} moduleBase={moduleBase} />}

          <StepFooter ctx={ctx} />
        </div>

        <CourseContent ctx={ctx} />
      </div>
    </div>
  );
}

function LockedStep({ steps, index, moduleBase }: { steps: ModuleStep[]; index: number; moduleBase: string }) {
  const blocker = steps.slice(0, index).find((st) => !st.done);
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-card p-5 shadow-card">
      <Lock className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      <div>
        <h2 className="font-display text-lg font-bold">Not yet</h2>
        <p className="mt-1 text-sm text-muted-foreground">Steps open one at a time. {blocker ? `Finish "${blocker.title}" first.` : null}</p>
        {blocker ? (
          <ButtonLink href={`${moduleBase}/${blocker.path}`} className="mt-4" size="sm">
            Go to {blocker.title}
          </ButtonLink>
        ) : null}
      </div>
    </div>
  );
}

/** What still stands between the learner and "Mark as completed". */
function pendingReason(ctx: StepContext): string {
  const { step, w } = ctx;
  if (step.kind === "lesson") return "Watch the video to the end to unlock this. Lenigo records watch time as it plays.";
  if (step.kind === "quiz") {
    const cp = w.checkpoints.find((c) => c.id === step.id);
    return `Pass this quiz (${cp?.passThreshold ?? 80}% or more) to unlock this.`;
  }
  const status = w.submissions[0]?.status;
  if (status === "PENDING") return "Your project is with a mentor. This unlocks once they approve it.";
  if (status === "NEEDS_REVISION") return "Your mentor asked for changes. Resubmit, and this unlocks once it's approved.";
  return "Submit your project. This unlocks once a mentor approves it.";
}

function StepFooter({ ctx }: { ctx: StepContext }) {
  const { steps, index, step, w, base, moduleBase } = ctx;
  const prev = steps[index - 1];
  const nextStep = steps[index + 1];
  const unlocked = step.open && (step.done || w.preview);

  let href: string;
  let after: string;
  if (nextStep) {
    href = `${moduleBase}/${nextStep.path}`;
    after = `Next: ${nextStep.title}`;
  } else if (w.next) {
    href = learnPath(base, w.track.slug, w.next.slug);
    after = `Next module: ${w.next.title}`;
  } else {
    href = w.preview && !w.enrollment ? `${base}/roadmap?track=${w.track.id}` : `${base}/roadmap`;
    after = "Back to your roadmap";
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center">
      {prev ? (
        <ButtonLink href={`${moduleBase}/${prev.path}`} variant="ghost" size="sm" className="self-start sm:self-auto">
          <ChevronLeft /> Previous
        </ButtonLink>
      ) : null}
      <p className="text-sm text-muted-foreground sm:ml-auto sm:text-right">{unlocked ? after : step.open ? pendingReason(ctx) : "Finish the earlier steps first."}</p>
      {unlocked ? (
        <ButtonLink href={href} className="shrink-0">
          <Check strokeWidth={3} /> Mark as completed <ChevronRight />
        </ButtonLink>
      ) : (
        <Button disabled className="shrink-0">
          <Lock /> Mark as completed
        </Button>
      )}
    </div>
  );
}

function stepMeta(st: ModuleStep, w: StepContext["w"]): string {
  if (st.kind === "lesson") {
    const r = w.resources.find((x) => x.id === st.id);
    return [r?.sourceName, formatMinutes(r?.durationSeconds), st.tracked ? null : "opens outside Lenigo"].filter(Boolean).join(" · ");
  }
  if (st.kind === "quiz") {
    const cp = w.checkpoints.find((c) => c.id === st.id);
    if (!cp) return "";
    return cp.passed ? `Passed with ${cp.best}%` : `${cp.questions.length} questions · pass ${cp.passThreshold}%`;
  }
  const status = w.submissions[0]?.status;
  return status === "APPROVED" ? "Approved" : status === "PENDING" ? "In review" : status === "NEEDS_REVISION" ? "Changes requested" : "Mentor-reviewed";
}

function StepIcon({ st }: { st: ModuleStep }) {
  if (st.done && st.tracked)
    return (
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-mint text-white">
        <Check className="size-3.5" strokeWidth={3} />
      </span>
    );
  const Icon = !st.open ? Lock : st.kind === "lesson" ? PlayCircle : st.kind === "quiz" ? ClipboardCheck : Hammer;
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface text-muted-foreground">
      <Icon className="size-3.5" />
    </span>
  );
}

function CourseContent({ ctx }: { ctx: StepContext }) {
  const { steps, step: current, w, moduleBase } = ctx;
  const counted = steps.filter((st) => st.tracked);
  const done = counted.filter((st) => st.done).length;
  const articles = w.resources.filter((r) => r.type === "ARTICLE");

  return (
    <aside className="space-y-4 xl:sticky xl:top-24">
      <nav aria-label="Course content" className="rounded-2xl bg-card p-4 shadow-card">
        <div className="mb-3">
          <h2 className="font-display text-base font-bold">Course content</h2>
          <div className="mt-2 flex items-center gap-3">
            <Progress value={counted.length ? Math.round((done / counted.length) * 100) : 0} className="flex-1" />
            <span className="shrink-0 text-xs text-muted-foreground tabular">
              {done}/{counted.length} done
            </span>
          </div>
        </div>
        <ol className="grid gap-1">
          {steps.map((st) => {
            const isCurrent = st.kind === current.kind && st.id === current.id;
            const body = (
              <>
                <StepIcon st={st} />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm leading-snug", isCurrent && "font-semibold")}>{st.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {KIND_LABEL[st.kind]}
                    {stepMeta(st, w) ? ` · ${stepMeta(st, w)}` : ""}
                  </span>
                </span>
              </>
            );
            const cls = cn("flex items-start gap-2.5 rounded-xl p-2", isCurrent ? "bg-secondary" : st.open ? "hover:bg-surface" : "opacity-60");
            return (
              <li key={`${st.kind}-${st.id}`}>
                {st.open ? (
                  <Link href={`${moduleBase}/${st.path}`} className={cls} aria-current={isCurrent ? "step" : undefined}>
                    {body}
                  </Link>
                ) : (
                  <div className={cls} aria-disabled>
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {articles.length ? (
        <div className="rounded-2xl bg-card p-4 shadow-card">
          <h2 className="font-display text-base font-bold">Learn more</h2>
          <p className="text-xs text-muted-foreground">Optional reading. It never blocks your progress.</p>
          <ul className="mt-2 grid gap-1">
            {articles.map((a) => (
              <li key={a.id}>
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 rounded-lg p-2 text-sm hover:bg-surface">
                  <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block font-medium">{a.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {a.sourceName ?? new URL(a.url).hostname}
                      {a.estMinutes ? ` · ${a.estMinutes} min` : ""}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}
