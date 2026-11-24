import Link from "next/link";
import { format } from "date-fns";
import { Check, ChevronLeft, CircleDashed, ClipboardCheck, ExternalLink, FileText, Hammer, Lock, PlayCircle } from "lucide-react";
import { PageHeader, Panel } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/button-link";
import { Section } from "@/components/form-field";
import { Markdown } from "@/components/markdown";
import { UserAvatar } from "@/components/user-avatar";
import { DriveLesson, ExternalLesson, YouTubeLesson } from "@/components/learn/lesson-player";
import { CheckpointQuiz } from "@/components/learn/checkpoint-quiz";
import { SubmitProjectForm } from "@/components/learn/learn-actions";
import { guard, pageSpaceRole } from "@/server/auth/guards";
import { getModuleWorkspace } from "@/server/services/learning";
import { embedUrl, trackingFor } from "@/lib/video";
import { formatMinutes } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const metadata = { title: "Module" };

type Workspace = Awaited<ReturnType<typeof getModuleWorkspace>>;

export default async function ModulePage({ params }: { params: Promise<{ community: string; space: string; moduleId: string }> }) {
  const { community: c, space: s, moduleId } = await params;
  const access = await pageSpaceRole(c, s, () => true);
  const w = await guard(() => getModuleWorkspace(access, moduleId));
  const base = `/c/${c}/${s}`;

  if (w.locked) {
    return (
      <div className="max-w-2xl">
        <BackLink base={base} w={w} />
        <PageHeader title={w.module.title} />
        <Panel>
          <div className="flex items-start gap-3 rounded-2xl bg-card p-5 shadow-card">
            <Lock className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <div>
              <h2 className="font-display text-lg font-bold">Not yet</h2>
              <p className="mt-1 text-sm text-muted-foreground">Modules open one at a time. {w.lockedBy ? `Finish "${w.lockedBy}" first.` : "Finish the module before this one first."}</p>
              <ButtonLink href={`${base}/roadmap`} className="mt-4" size="sm">
                Back to your roadmap
              </ButtonLink>
            </div>
          </div>
        </Panel>
      </div>
    );
  }

  const videos = w.resources.filter((r) => r.type === "VIDEO");
  const articles = w.resources.filter((r) => r.type === "ARTICLE");
  const trackable = videos.filter((v) => trackingFor(v.provider ?? "EXTERNAL") !== "none");
  const videosDone = trackable.filter((v) => v.completed).length;
  const cpsPassed = w.checkpoints.filter((cp) => cp.passed).length;
  const latest = w.submissions[0] ?? null;
  const canSubmit = !w.preview && videosDone === trackable.length && cpsPassed === w.checkpoints.length && latest?.status !== "PENDING" && latest?.status !== "APPROVED";
  const loose = w.checkpoints.filter((cp) => !cp.afterResourceId || !videos.some((v) => v.id === cp.afterResourceId));

  const steps = [
    { label: "Watch every video", done: videosDone === trackable.length, detail: `${videosDone}/${trackable.length}` },
    { label: "Pass each checkpoint", done: cpsPassed === w.checkpoints.length, detail: `${cpsPassed}/${w.checkpoints.length}` },
    {
      label: "Ship the capstone",
      done: latest?.status === "APPROVED",
      detail: latest?.status === "APPROVED" ? "approved" : latest?.status === "PENDING" ? "in review" : latest?.status === "NEEDS_REVISION" ? "changes requested" : "to do",
    },
  ];

  return (
    <div className="space-y-6">
      <BackLink base={base} w={w} />
      <PageHeader
        eyebrow={`${w.track.title} · ${w.level.title}`}
        title={w.module.title}
        description={w.module.summary ?? undefined}
        actions={w.placedOut ? <Badge variant="lilac">Placed out: no points here</Badge> : w.preview ? <Badge variant="muted">Preview</Badge> : null}
        className="pb-2"
      />

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_17rem]">
        <div className="space-y-6">
          {videos.map((v, i) => (
            <Panel key={v.id} tone="lilac">
              <Section
                title={
                  <span className="flex items-center gap-2">
                    <span className="grid size-7 place-items-center rounded-lg bg-ink text-xs text-ink-foreground">{i + 1}</span>
                    {v.title}
                  </span>
                }
                description={[v.sourceName, formatMinutes(v.durationSeconds)].filter(Boolean).join(" · ") || undefined}
              >
                {v.provider === "YOUTUBE" && v.providerId ? (
                  <YouTubeLesson c={c} s={s} resourceId={v.id} videoId={v.providerId} startAt={v.completed ? 0 : v.lastPositionSeconds} watchedPct={v.watchedPct} completed={v.completed} preview={w.preview} />
                ) : v.provider === "GOOGLE_DRIVE" && v.providerId ? (
                  <DriveLesson c={c} s={s} resourceId={v.id} embedUrl={embedUrl({ provider: "GOOGLE_DRIVE", providerId: v.providerId })!} watchedPct={v.watchedPct} completed={v.completed} preview={w.preview} />
                ) : (
                  <ExternalLesson url={v.url} />
                )}
              </Section>
              {w.checkpoints
                .filter((cp) => cp.afterResourceId === v.id)
                .map((cp) => (
                  <CheckpointBlock key={cp.id} c={c} s={s} cp={cp} preview={w.preview} />
                ))}
            </Panel>
          ))}

          {loose.length ? (
            <Panel tone="sun">
              <div className="grid gap-3">
                {loose.map((cp) => (
                  <CheckpointBlock key={cp.id} c={c} s={s} cp={cp} preview={w.preview} flush />
                ))}
              </div>
            </Panel>
          ) : null}

          <Panel tone="sage">
            <Section
              title={
                <span className="flex items-center gap-2">
                  <Hammer className="size-5" /> Capstone project
                </span>
              }
              description="Build it, push it, and a mentor reviews and scores it."
            >
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
                  <p className="text-sm text-muted-foreground">Learners submit here once their videos and checkpoints are done.</p>
                ) : (
                  <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <Lock className="size-4" /> Opens once you&rsquo;ve watched every video and passed every checkpoint.
                  </p>
                )}
              </div>

              {w.submissions.length ? (
                <div className="mt-6 border-t border-border pt-4">
                  <h3 className="mb-3 text-sm font-semibold">Your submissions</h3>
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
            </Section>
          </Panel>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24">
          <Panel>
            <Section title="To finish this module">
              <ol className="grid gap-2.5">
                {steps.map((st) => (
                  <li key={st.label} className="flex items-center gap-2.5 text-sm">
                    <span className={cn("grid size-6 place-items-center rounded-full", st.done ? "bg-mint text-white" : "bg-surface text-muted-foreground")}>
                      {st.done ? <Check className="size-3.5" strokeWidth={3} /> : <CircleDashed className="size-3.5" />}
                    </span>
                    <span className="flex-1">{st.label}</span>
                    <span className="text-xs text-muted-foreground tabular">{st.detail}</span>
                  </li>
                ))}
              </ol>
            </Section>
          </Panel>
          {articles.length ? (
            <Panel>
              <Section title="Learn more" description="Optional reading.">
                <ul className="grid gap-2">
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
              </Section>
            </Panel>
          ) : null}
          {!videos.length ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <PlayCircle className="size-4" /> No video lessons in this module.
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function BackLink({ base, w }: { base: string; w: Workspace }) {
  return (
    <Link href={w.preview && !w.enrollment ? `${base}/roadmap?track=${w.track.id}` : `${base}/roadmap`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ChevronLeft className="size-4" /> Roadmap
    </Link>
  );
}

function CheckpointBlock({ c, s, cp, preview, flush }: { c: string; s: string; cp: Workspace["checkpoints"][number]; preview: boolean; flush?: boolean }) {
  return (
    <div className={cn("rounded-2xl bg-card p-5 shadow-card ring-1 ring-foreground/5", !flush && "mt-3")}>
      <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
        <ClipboardCheck className="size-5 text-primary" /> Checkpoint: {cp.title}
      </h3>
      <CheckpointQuiz c={c} s={s} checkpoint={cp} preview={preview} />
    </div>
  );
}
