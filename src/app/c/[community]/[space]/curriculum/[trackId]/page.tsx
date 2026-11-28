import Link from "next/link";
import { ChevronLeft, CircleCheck, CircleDashed, Eye, GitFork } from "lucide-react";
import { PageHeader, Panel } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/button-link";
import { Section } from "@/components/form-field";
import {
  AddBranchForm,
  AddModuleForm,
  DeleteButton,
  LevelTitleForm,
  MoveButtons,
  PublishToggle,
  QuestionForm,
  TrackSettingsForm,
} from "@/components/curriculum/editor";
import { guard, pageSpaceRole } from "@/server/auth/guards";
import { getTrackEditor } from "@/server/services/curriculum";
import { MIN_BANK } from "@/server/services/placement";
import { LEVEL_LABEL, space as rules } from "@/lib/permissions";
import { PLACEMENT } from "@/lib/placement";

export const metadata = { title: "Edit track" };

export default async function TrackEditorPage({ params }: { params: Promise<{ community: string; space: string; trackId: string }> }) {
  const { community: c, space: s, trackId } = await params;
  const access = await pageSpaceRole(c, s, rules.canEditCurriculum);
  const { track, levels, otherTracks, placementQuestions, placementOptions } = await guard(() => getTrackEditor(access, trackId));
  // Each learner draws from questions for everyone plus their own option: the smallest of those pools decides.
  const shared = placementQuestions.filter((q) => !q.branchId).length;
  const pools = placementOptions.length
    ? placementOptions.map((o) => ({ title: o.title, n: shared + placementQuestions.filter((q) => q.branchId === o.id).length }))
    : [{ title: null, n: shared }];
  const bankReady = pools.every((p) => p.n >= MIN_BANK);
  const base = `/c/${c}/${s}`;

  return (
    <div className="space-y-6">
      <Link href={`${base}/curriculum`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> All tracks
      </Link>
      <PageHeader
        eyebrow={track.isPublished ? "Published track" : "Draft track"}
        title={track.title}
        description={track.description ?? undefined}
        actions={
          <>
            <ButtonLink href={`${base}/roadmap?track=${track.id}`} variant="outline" size="sm">
              <Eye /> Preview as learner
            </ButtonLink>
            <PublishToggle c={c} s={s} kind="track" id={track.id} published={track.isPublished} />
            <DeleteButton c={c} s={s} kind="track" id={track.id} label={`the ${track.title} track`} redirectTo={`${base}/curriculum`} />
          </>
        }
        className="pb-2"
      />

      {levels.map((level) => {
        const core = level.modules.filter((m) => !m.branchId);
        return (
          <Panel key={level.id} tone={level.tier === "BEGINNER" ? "sage" : level.tier === "INTERMEDIATE" ? "lilac" : "sun"}>
            <Section
              title={
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant="ink">{LEVEL_LABEL[level.tier]}</Badge>
                  <LevelTitleForm c={c} s={s} levelId={level.id} title={level.title} />
                </span>
              }
              actions={<PublishToggle c={c} s={s} kind="level" id={level.id} published={level.isPublished} size="xs" />}
            >
              <ModuleList c={c} s={s} title="Core modules" hint="Everyone at this level takes these, in order." modules={core} />

              {level.branches.map((b) => (
                <ModuleList
                  key={b.id}
                  c={c}
                  s={s}
                  title={
                    <span className="inline-flex items-center gap-1.5">
                      <GitFork className="size-3.5" /> Option: {b.title}
                      <DeleteButton c={c} s={s} kind="branch" id={b.id} label={`the ${b.title} option`} />
                    </span>
                  }
                  hint="Only learners who pick this option take these, after the core."
                  modules={level.modules.filter((m) => m.branchId === b.id)}
                />
              ))}

              <div className="mt-5 grid gap-3 border-t border-border pt-4 lg:grid-cols-[1fr_20rem]">
                <AddModuleForm c={c} s={s} levelId={level.id} branches={level.branches} />
                <div>
                  <AddBranchForm c={c} s={s} levelId={level.id} />
                  <p className="mt-1.5 text-xs text-muted-foreground">Options let learners pick one path after the core, e.g. React or Vue.</p>
                </div>
              </div>
            </Section>
          </Panel>
        );
      })}

      <Panel>
        <div className="grid gap-4">
          <Section title="Track settings">
            <TrackSettingsForm c={c} s={s} track={track} otherTracks={otherTracks} />
          </Section>
          <Section
            title="Placement quiz question bank"
            description={`Each test draws up to ${PLACEMENT.quizQuestions} questions at random (${PLACEMENT.quizMinutes} minutes, pass mark ${PLACEMENT.quizPassPct}%). The test is offered once there are at least ${MIN_BANK} questions and a practical task above.`}
            actions={<Badge variant={bankReady && track.placementTaskMd ? "mint" : "muted"}>{placementQuestions.length} questions</Badge>}
          >
            {placementOptions.length ? (
              <p className="mb-3 text-sm text-muted-foreground">
                Questions per learner: {pools.map((p) => `${p.title} ${p.n}`).join(" · ")}. Each option needs at least {MIN_BANK}.
              </p>
            ) : null}
            <ol className="mb-4 grid gap-2">
              {placementQuestions.map((q, i) => (
                <li key={q.id} className="flex items-start gap-3 rounded-xl bg-surface p-3 text-sm">
                  <span className="font-semibold text-muted-foreground">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{q.prompt}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Answer: {q.options[q.correctOptionIndex]}
                      {q.branchId ? ` · Only ${placementOptions.find((o) => o.id === q.branchId)?.title ?? "one option"}` : ""}
                    </p>
                  </div>
                  <DeleteButton c={c} s={s} kind="placement-question" id={q.id} label="this question" />
                </li>
              ))}
            </ol>
            <QuestionForm c={c} s={s} target={{ kind: "placement", trackId: track.id, options: placementOptions }} />
          </Section>
        </div>
      </Panel>
    </div>
  );
}

function ModuleList({
  c,
  s,
  title,
  hint,
  modules,
}: {
  c: string;
  s: string;
  title: React.ReactNode;
  hint: string;
  modules: { id: string; title: string; isPublished: boolean; resourceCount: number; checkpointCount: number; projectBriefMd: string | null }[];
}) {
  return (
    <div className="mt-2 first:mt-0">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      {modules.length === 0 ? (
        <p className="mb-3 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">No modules yet.</p>
      ) : (
        <ul className="mb-3 divide-y divide-border rounded-xl border border-border">
          {modules.map((m, i) => (
            <li key={m.id} className="flex items-center gap-2 px-2 py-2">
              <MoveButtons c={c} s={s} kind="module" id={m.id} first={i === 0} last={i === modules.length - 1} />
              {m.isPublished ? <CircleCheck className="size-4 text-mint" /> : <CircleDashed className="size-4 text-muted-foreground" />}
              <Link href={`/c/${c}/${s}/curriculum/modules/${m.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                {m.title}
              </Link>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {m.resourceCount} lessons · {m.checkpointCount} checkpoints · {m.projectBriefMd ? "brief ✓" : "no brief"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
