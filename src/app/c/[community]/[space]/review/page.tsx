import Link from "next/link";
import { format, formatDistanceToNowStrict } from "date-fns";
import { ArrowRight, ClipboardCheck, ExternalLink, Rocket } from "lucide-react";
import { EmptyState, PageHeader, Panel, StatTile } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/form-field";
import { Markdown } from "@/components/markdown";
import { UserAvatar } from "@/components/user-avatar";
import { PromoteDialog, ReviewSubmissionForm } from "@/components/review/mentor-actions";
import { guard, pageSpaceRole } from "@/server/auth/guards";
import { getReviewQueue } from "@/server/services/review";
import { LEVEL_LABEL, space as rules } from "@/lib/permissions";

export const metadata = { title: "Review queue" };

export default async function ReviewPage({ params }: { params: Promise<{ community: string; space: string }> }) {
  const { community: c, space: s } = await params;
  const access = await pageSpaceRole(c, s, rules.canReview);
  const q = await guard(() => getReviewQueue(access));
  const base = `/c/${c}/${s}`;
  const canPromote = rules.canPromoteLevel(access.spaceRole);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Mentors" title="Review queue" description="Oldest first. Approve and score, or request changes with feedback the learner can act on." />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile icon={<ClipboardCheck />} tone="sun" label="Projects waiting" value={q.pending.length} />
        <StatTile icon={<Rocket />} tone="lilac" label="Placement tests" value={q.placementsToReview.length + q.placementsToPromote.length} />
        <StatTile
          icon={<ClipboardCheck />}
          tone="mint"
          label="Average turnaround"
          value={q.turnaround.hours == null ? "–" : q.turnaround.hours < 24 ? `${Math.round(q.turnaround.hours)} h` : `${(q.turnaround.hours / 24).toFixed(1)} d`}
          hint={`${q.turnaround.n} reviews in the last 30 days`}
        />
      </div>

      {q.placementsToPromote.length && canPromote ? (
        <Panel tone="lilac">
          <Section title="Recommended: ready to promote" description="A reviewer recommended these learners. Promoting is a separate, recorded step.">
            <ul className="grid gap-2">
              {q.placementsToPromote.map((p) => (
                <li key={p.attempt.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-surface p-3">
                  <UserAvatar name={p.learner.name} email={p.learner.email} src={p.learner.avatarUrl} />
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="font-medium">{p.learner.name ?? p.learner.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.track} · quiz {p.attempt.quizScorePct}% ·{" "}
                      <Link href={`${base}/placement/${p.attempt.id}`} className="underline">
                        open test
                      </Link>
                    </div>
                  </div>
                  {p.enrollment && p.learner.id !== access.user.id ? (
                    <PromoteDialog c={c} s={s} enrollmentId={p.enrollment.id} learner={p.learner.name ?? p.learner.email} from={LEVEL_LABEL.BEGINNER} to={LEVEL_LABEL.INTERMEDIATE} placementAttemptId={p.attempt.id} />
                  ) : null}
                </li>
              ))}
            </ul>
          </Section>
        </Panel>
      ) : null}

      {q.placementsToReview.length ? (
        <Panel tone="lilac">
          <Section title="Placement tests to review">
            <ul className="grid gap-2">
              {q.placementsToReview.map((p) => (
                <li key={p.attempt.id}>
                  <Link href={`${base}/placement/${p.attempt.id}`} className="flex items-center gap-3 rounded-xl bg-surface p-3 hover:bg-accent">
                    <UserAvatar name={p.learner.name} email={p.learner.email} src={p.learner.avatarUrl} />
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="font-medium">{p.learner.name ?? p.learner.email}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.track} · quiz {p.attempt.quizScorePct}% · submitted {p.attempt.submittedAt ? formatDistanceToNowStrict(p.attempt.submittedAt, { addSuffix: true }) : ""}
                      </div>
                    </div>
                    {p.mine ? <Badge variant="muted">Yours</Badge> : <ArrowRight className="size-4" />}
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        </Panel>
      ) : null}

      {q.pending.length === 0 ? (
        <EmptyState icon={<ClipboardCheck />} title="Nothing waiting">
          New capstone projects land here as learners submit them.
        </EmptyState>
      ) : (
        <Panel tone="sun">
          <div className="grid gap-4">
            {q.pending.map((p) => (
              <article key={p.submission.id} className="rounded-2xl bg-card p-5 shadow-card">
                <header className="flex flex-wrap items-center gap-3">
                  <UserAvatar name={p.learner.name} email={p.learner.email} src={p.learner.avatarUrl} className="size-10" />
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-lg font-bold">{p.module.title}</h2>
                    <p className="text-sm text-muted-foreground">
                      {p.learner.name ?? p.learner.email} · {p.track} · waiting {formatDistanceToNowStrict(p.submission.createdAt)}
                    </p>
                  </div>
                  <div className="flex gap-3 text-sm">
                    <a href={p.submission.repoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary">
                      Code <ExternalLink className="size-3.5" />
                    </a>
                    {p.submission.liveUrl ? (
                      <a href={p.submission.liveUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary">
                        Live <ExternalLink className="size-3.5" />
                      </a>
                    ) : null}
                  </div>
                </header>
                {p.submission.notes ? <p className="mt-3 rounded-xl bg-surface p-3 text-sm whitespace-pre-wrap">{p.submission.notes}</p> : null}
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer font-medium text-muted-foreground">The brief</summary>
                  <Markdown source={p.module.projectBriefMd} className="mt-2 rounded-xl bg-surface p-4" />
                </details>
                <div className="mt-4 border-t border-border pt-4">
                  {p.mine ? <p className="text-sm text-muted-foreground">This is your own project. Another mentor reviews it.</p> : <ReviewSubmissionForm c={c} s={s} submissionId={p.submission.id} />}
                </div>
              </article>
            ))}
          </div>
        </Panel>
      )}

      {q.recent.length ? (
        <Panel>
          <Section title="Recently reviewed">
            <ul className="divide-y divide-border text-sm">
              {q.recent.map((r) => (
                <li key={r.review.id} className="flex items-center gap-3 py-2.5">
                  <Badge variant={r.review.decision === "APPROVED" ? "mint" : "rose"}>{r.review.decision === "APPROVED" ? `${r.review.score}/100` : "Changes"}</Badge>
                  <span className="min-w-0 flex-1 truncate">
                    {r.learner.name ?? r.learner.email} · {r.module}
                  </span>
                  <span className="text-xs text-muted-foreground">{format(r.review.createdAt, "d MMM")}</span>
                </li>
              ))}
            </ul>
          </Section>
        </Panel>
      ) : null}
    </div>
  );
}
