import Link from "next/link";
import { format } from "date-fns";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { PageHeader, Panel } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/form-field";
import { Markdown } from "@/components/markdown";
import { PlacementQuiz, PlacementTaskForm } from "@/components/learn/placement-flow";
import { ReviewPlacementForm } from "@/components/review/mentor-actions";
import { guard, pageSpaceRole } from "@/server/auth/guards";
import { getPlacementAttempt } from "@/server/services/placement";
import { PLACEMENT } from "@/lib/placement";
import { space as rules } from "@/lib/permissions";

export const metadata = { title: "Placement test" };

const STATUS = {
  QUIZ: ["Quiz in progress", "sun"],
  TASK: ["Practical task", "lilac"],
  AWAITING_REVIEW: ["With a mentor", "sun"],
  RECOMMENDED: ["Recommended", "mint"],
  NOT_RECOMMENDED: ["Not this time", "rose"],
  EXPIRED: ["Ended", "muted"],
} as const;

export default async function PlacementPage({ params }: { params: Promise<{ community: string; space: string; attemptId: string }> }) {
  const { community: c, space: s, attemptId } = await params;
  const access = await pageSpaceRole(c, s, () => true);
  const { attempt, track, learner, isOwner, questions } = await guard(() => getPlacementAttempt(access, attemptId));
  const [label, tone] = STATUS[attempt.status];
  const base = `/c/${c}/${s}`;

  return (
    <div className="max-w-3xl space-y-6">
      <Link href={isOwner ? `${base}/roadmap` : `${base}/review`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> {isOwner ? "Roadmap" : "Review queue"}
      </Link>
      <PageHeader
        eyebrow={`Placement test · ${track.title}`}
        title={isOwner ? "Show what you know" : `${learner?.name ?? learner?.email}'s placement test`}
        actions={<Badge variant={tone}>{label}</Badge>}
        className="pb-2"
      />

      {attempt.quizScorePct != null ? (
        <p className="text-sm text-muted-foreground">
          Quiz score: <strong className="text-foreground">{attempt.quizScorePct}%</strong> (pass mark {PLACEMENT.quizPassPct}%)
        </p>
      ) : null}

      {isOwner && attempt.status === "QUIZ" ? (
        <Panel tone="lilac">
          <Section title="Quiz" description={`${questions.length} questions, ${PLACEMENT.quizMinutes} minutes. Pick the best answer for each.`}>
            <PlacementQuiz c={c} s={s} attemptId={attempt.id} deadline={attempt.quizDeadlineAt.toISOString()} questions={questions} />
          </Section>
        </Panel>
      ) : null}

      {attempt.status === "TASK" || attempt.taskRepoUrl ? (
        <Panel tone="sage">
          <Section title="Practical task" description={isOwner && attempt.status === "TASK" ? "Build this and send the link. A mentor reviews it." : undefined}>
            <Markdown source={track.placementTaskMd} className="rounded-xl bg-surface p-4" />
            {isOwner && attempt.status === "TASK" ? (
              <div className="mt-5">
                <PlacementTaskForm c={c} s={s} attemptId={attempt.id} />
              </div>
            ) : null}
            {attempt.taskRepoUrl ? (
              <p className="mt-4 flex flex-wrap gap-4 text-sm">
                <a href={attempt.taskRepoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary">
                  Code <ExternalLink className="size-3.5" />
                </a>
                {attempt.taskLiveUrl ? (
                  <a href={attempt.taskLiveUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary">
                    Live <ExternalLink className="size-3.5" />
                  </a>
                ) : null}
                {attempt.submittedAt ? <span className="text-muted-foreground">Submitted {format(attempt.submittedAt, "d MMM, HH:mm")}</span> : null}
              </p>
            ) : null}
          </Section>
        </Panel>
      ) : null}

      {attempt.status === "AWAITING_REVIEW" && !isOwner && rules.canReviewPlacement(access.spaceRole) ? (
        <Panel>
          <Section title="Your review">
            <ReviewPlacementForm c={c} s={s} attemptId={attempt.id} />
          </Section>
        </Panel>
      ) : null}

      {attempt.reviewFeedback ? (
        <Panel>
          <Section title="Mentor feedback">
            <p className="text-sm whitespace-pre-wrap">{attempt.reviewFeedback}</p>
            {attempt.status === "RECOMMENDED" && isOwner ? <p className="mt-3 text-sm text-muted-foreground">A Mentor or Lead will move you up shortly.</p> : null}
          </Section>
        </Panel>
      ) : null}

      {attempt.status === "EXPIRED" && isOwner ? (
        <p className="rounded-2xl bg-surface p-4 text-sm text-muted-foreground">
          This attempt has ended. You can try again {PLACEMENT.retakeAfterDays} days after you started it. Meanwhile, the first level moves fast if you already know it.
        </p>
      ) : null}
    </div>
  );
}
