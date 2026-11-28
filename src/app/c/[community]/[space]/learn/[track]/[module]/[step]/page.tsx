import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Check, ExternalLink, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/markdown";
import { UserAvatar } from "@/components/user-avatar";
import { DriveLesson, ExternalLesson, YouTubeLesson } from "@/components/learn/lesson-player";
import { CheckpointQuiz } from "@/components/learn/checkpoint-quiz";
import { SubmitProjectForm } from "@/components/learn/learn-actions";
import { ModulePlayer } from "@/components/learn/module-player";
import { embedUrl } from "@/lib/video";
import { loadStep, type StepContext, type StepParams } from "../load";

// A fixed title: the step's own name could tell someone without access what a module contains.
export const metadata = { title: "Learn" };

/** One step of a module, on its own page: a video lesson, a quiz or the capstone project. */
export default async function StepPage({ params }: { params: StepParams }) {
  const ctx = await loadStep(params);
  return (
    <ModulePlayer ctx={ctx}>
      {ctx.step.kind === "lesson" ? <Lesson ctx={ctx} /> : ctx.step.kind === "quiz" ? <Quiz ctx={ctx} /> : <Project ctx={ctx} />}
    </ModulePlayer>
  );
}

function Lesson({ ctx }: { ctx: StepContext }) {
  const { c, s, w, step } = ctx;
  const v = w.resources.find((r) => r.id === step.id);
  if (!v) notFound();
  return (
    <div className="rounded-2xl bg-card p-3 shadow-card sm:p-4">
      {v.provider === "YOUTUBE" && v.providerId ? (
        <YouTubeLesson c={c} s={s} resourceId={v.id} videoId={v.providerId} startAt={v.completed ? 0 : v.lastPositionSeconds} watchedPct={v.watchedPct} completed={v.completed} preview={w.preview} />
      ) : v.provider === "GOOGLE_DRIVE" && v.providerId ? (
        <DriveLesson c={c} s={s} resourceId={v.id} embedUrl={embedUrl({ provider: "GOOGLE_DRIVE", providerId: v.providerId })!} watchedPct={v.watchedPct} completed={v.completed} preview={w.preview} />
      ) : (
        <ExternalLesson url={v.url} />
      )}
      {v.sourceName ? <p className="mt-3 px-1 text-sm text-muted-foreground">Video by {v.sourceName}.</p> : null}
    </div>
  );
}

function Quiz({ ctx }: { ctx: StepContext }) {
  const { c, s, w, step } = ctx;
  const cp = w.checkpoints.find((x) => x.id === step.id);
  if (!cp) notFound();
  const lesson = cp.afterResourceId ? w.resources.find((r) => r.id === cp.afterResourceId) : null;
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card">
      {lesson ? <p className="mb-4 text-sm text-muted-foreground">Checks what you learned in &ldquo;{lesson.title}&rdquo; and the lessons before it.</p> : null}
      <CheckpointQuiz c={c} s={s} checkpoint={cp} preview={w.preview} />
    </div>
  );
}

function Project({ ctx }: { ctx: StepContext }) {
  const { c, s, w, steps } = ctx;
  const latest = w.submissions[0] ?? null;
  const ready = steps.filter((st) => st.kind !== "project").every((st) => st.done);
  const canSubmit = !w.preview && ready && latest?.status !== "PENDING" && latest?.status !== "APPROVED";

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-card p-5 shadow-card">
        <p className="mb-3 text-sm text-muted-foreground">Build it, push it, and a mentor reviews and scores it.</p>
        <Markdown source={w.module.projectBriefMd} className="rounded-xl bg-surface p-4" />
        <div className="mt-5">
          {latest?.status === "APPROVED" ? (
            <p className="inline-flex items-center gap-2 text-sm font-medium text-mint-foreground">
              <Check className="size-4 text-mint" strokeWidth={3} /> Approved. Nice work.
            </p>
          ) : latest?.status === "PENDING" ? (
            <p className="text-sm text-muted-foreground">Submitted {format(latest.createdAt, "d MMM, HH:mm")}. A mentor will review it soon.</p>
          ) : canSubmit ? (
            <SubmitProjectForm c={c} s={s} moduleId={w.module.id} resubmit={latest?.status === "NEEDS_REVISION"} />
          ) : w.preview ? (
            <p className="text-sm text-muted-foreground">Learners submit here once their videos and quizzes are done.</p>
          ) : (
            <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Lock className="size-4" /> Opens once you&rsquo;ve watched every video and passed every quiz.
            </p>
          )}
        </div>
      </div>

      {w.submissions.length ? (
        <div className="rounded-2xl bg-card p-5 shadow-card">
          <h2 className="mb-3 font-display text-base font-bold">Your submissions</h2>
          <ol className="grid gap-3">
            {w.submissions.map((sub) => (
              <li key={sub.id} className="rounded-xl border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={sub.status === "APPROVED" ? "mint" : sub.status === "PENDING" ? "sun" : "rose"}>
                    {sub.status === "APPROVED" ? "Approved" : sub.status === "PENDING" ? "In review" : "Changes requested"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{format(sub.createdAt, "d MMM yyyy")}</span>
                  <a href={sub.repoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                    Code <ExternalLink className="size-3" />
                  </a>
                  {sub.liveUrl ? (
                    <a href={sub.liveUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                      Live <ExternalLink className="size-3" />
                    </a>
                  ) : null}
                </div>
                {sub.reviews.map(({ review, reviewerName }) => (
                  <div key={review.id} className="mt-3 flex gap-2.5 rounded-lg bg-surface p-3">
                    <UserAvatar name={reviewerName} className="size-6" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground">
                        {reviewerName ?? "A mentor"} · {format(review.createdAt, "d MMM")}
                        {review.score != null ? ` · scored ${review.score}/100` : ""}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap">{review.feedback}</p>
                    </div>
                  </div>
                ))}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
