import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Check, CircleDot, Eye, FastForward, GitFork, Lock, Map, PartyPopper, Rocket } from "lucide-react";
import { EmptyState, PageHeader, Panel } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/button-link";
import { Progress } from "@/components/form-field";
import { BranchPicker, StartPlacementButton } from "@/components/learn/learn-actions";
import { pageSpaceRole } from "@/server/auth/guards";
import { listTracks } from "@/server/services/curriculum";
import { getRoadmap, type LevelNode, type ModuleNode, type TrackProgress } from "@/server/services/learning";
import { placementOffer } from "@/server/services/placement";
import { LEVEL_LABEL, MODULE_REQUIREMENTS, space as rules } from "@/lib/permissions";
import { PLACEMENT } from "@/lib/placement";
import { cn } from "@/lib/utils";

export const metadata = { title: "Roadmap" };

export default async function RoadmapPage({
  params,
  searchParams,
}: {
  params: Promise<{ community: string; space: string }>;
  searchParams: Promise<{ track?: string }>;
}) {
  const { community: c, space: s } = await params;
  const { track: previewId } = await searchParams;
  const access = await pageSpaceRole(c, s, () => true);
  const staff = rules.bypassesLocks(access.spaceRole);
  const { enrollments, progress, preview } = await getRoadmap(access, previewId);
  const base = `/c/${c}/${s}`;

  if (!enrollments.length && !preview) {
    if (!staff) redirect(`${base}/onboarding`);
    const tracks = await listTracks(access.space.id, { publishedOnly: !rules.canEditCurriculum(access.spaceRole) });
    return (
      <div>
        <PageHeader eyebrow="Roadmap" title="Preview a track" description="You're on the team, so you aren't enrolled in a track. Open one to see it the way learners do, with every level unlocked." />
        {tracks.length ? (
          <Panel>
            <ul className="grid gap-3 sm:grid-cols-2">
              {tracks.map((t) => (
                <li key={t.id}>
                  <Link href={`?track=${t.id}`} className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-card hover:-translate-y-0.5 transition-transform">
                    <Eye className="size-4 text-muted-foreground" />
                    <span className="flex-1 font-display font-bold">{t.title}</span>
                    {!t.isPublished ? <Badge variant="muted">Draft</Badge> : null}
                    <ArrowRight className="size-4" />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        ) : (
          <EmptyState icon={<Map />} title="No tracks yet" action={rules.canEditCurriculum(access.spaceRole) ? <ButtonLink href={`${base}/curriculum`}>Build the first track</ButtonLink> : undefined}>
            Tracks appear here once they&rsquo;re published.
          </EmptyState>
        )}
      </div>
    );
  }

  const offers = await Promise.all(progress.map((p) => (p.enrollment?.tier === "BEGINNER" ? placementOffer(access.space.id, p.track.id, access.user.id) : null)));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Roadmap"
        title={preview ? `${preview.track.title} (preview)` : "Your roadmap"}
        description={preview ? "Every level is open in preview. Learners only see their own level and below. Only published levels and modules appear." : "One module at a time. Each one ends when you've watched every video, passed every checkpoint and a mentor approved your project."}
        actions={
          !preview ? (
            <ButtonLink href={`${base}/onboarding`} variant="outline" size="sm">
              Your answers
            </ButtonLink>
          ) : (
            <ButtonLink href={`${base}/roadmap`} variant="outline" size="sm">
              Back
            </ButtonLink>
          )
        }
      />

      {!preview ? (
        <ul className="flex flex-wrap gap-2 text-xs">
          {MODULE_REQUIREMENTS.map((r, i) => (
            <li key={r.key} className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 font-medium" title={r.hint}>
              <span className="grid size-5 place-items-center rounded-full bg-ink text-[10px] text-ink-foreground">{i + 1}</span> {r.label}
            </li>
          ))}
        </ul>
      ) : null}

      {preview ? <TrackRoadmap c={c} s={s} p={preview} offer={null} /> : progress.map((p, i) => <TrackRoadmap key={p.track.id} c={c} s={s} p={p} offer={offers[i]} />)}

      {!preview && enrollments.length ? (
        <p className="text-sm text-muted-foreground">Want to add another track? Ask a mentor: a second track starts once they approve it.</p>
      ) : null}
    </div>
  );
}

function TrackRoadmap({ c, s, p, offer }: { c: string; s: string; p: TrackProgress; offer: Awaited<ReturnType<typeof placementOffer>> | null }) {
  const current = p.levels.find((l) => l.tier === (p.enrollment?.tier ?? "BEGINNER"));
  const pct = p.totals.modules ? (p.totals.complete / p.totals.modules) * 100 : 0;
  const base = `/c/${c}/${s}`;
  return (
    <section className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-card p-5 shadow-card">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl font-black tracking-tight uppercase">{p.track.title}</h2>
              {p.enrollment ? <Badge variant="ink">{current?.title ?? LEVEL_LABEL[p.enrollment.tier]}</Badge> : null}
              {p.placedInto ? <Badge variant="lilac">Placed into {p.levels.find((l) => l.tier === p.placedInto)?.title ?? LEVEL_LABEL[p.placedInto]}</Badge> : null}
            </div>
            {p.track.description ? <p className="mt-1 text-sm text-muted-foreground">{p.track.description}</p> : null}
          </div>
          {!p.preview ? (
            <div className="w-full sm:w-56">
              <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                <span>Progress</span>
                <span className="tabular">
                  {p.totals.complete}/{p.totals.modules} modules
                </span>
              </div>
              <Progress value={pct} tone="mint" />
            </div>
          ) : null}
          {p.activeModuleId ? (
            <ButtonLink href={`${base}/modules/${p.activeModuleId}`}>
              Continue <ArrowRight />
            </ButtonLink>
          ) : null}
        </div>
      </Panel>

      {p.readyForPromotion ? (
        <div className="flex items-start gap-3 rounded-2xl bg-mint-soft p-4 text-sm text-mint-foreground">
          <PartyPopper className="mt-0.5 size-5 shrink-0" />
          <p>
            <strong>You&rsquo;ve finished this level.</strong> Your mentor can see it and will move you up when they&rsquo;ve had a look. Keep posting standups while you wait.
          </p>
        </div>
      ) : null}

      {offer?.offered ? <PlacementCard c={c} s={s} trackId={p.track.id} offer={offer} /> : null}

      <ol className="grid gap-4">
        {p.levels.map((l) => (
          <LevelBlock key={l.id} c={c} s={s} level={l} p={p} />
        ))}
      </ol>
    </section>
  );
}

function PlacementCard({ c, s, trackId, offer }: { c: string; s: string; trackId: string; offer: Extract<Awaited<ReturnType<typeof placementOffer>>, { offered: true }> }) {
  const latest = offer.latest;
  const open = latest && ["QUIZ", "TASK", "AWAITING_REVIEW", "RECOMMENDED"].includes(latest.status);
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-ink p-5 text-ink-foreground">
      <Rocket className="size-6 shrink-0" />
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-lg font-bold">Already know the basics?</h3>
        <p className="text-sm text-ink-foreground/70">
          {open
            ? latest.status === "AWAITING_REVIEW"
              ? "Your placement test is with a mentor."
              : latest.status === "RECOMMENDED"
                ? "A mentor recommended you for the next level. They'll move you up shortly."
                : "You have a placement test in progress."
            : `A ${PLACEMENT.quizMinutes}-minute quiz and a small build task. A mentor reviews it and can move you to the next level. Once every ${PLACEMENT.retakeAfterDays} days.`}
        </p>
      </div>
      {open ? (
        <ButtonLink href={`/c/${c}/${s}/placement/${latest.id}`} variant="secondary">
          Open test
        </ButtonLink>
      ) : offer.canStart ? (
        <StartPlacementButton c={c} s={s} trackId={trackId} />
      ) : (
        <span className="text-sm text-ink-foreground/70">Next attempt {offer.retakeAt?.toLocaleDateString()}</span>
      )}
    </div>
  );
}

const LEVEL_TONE = { BEGINNER: "sage", INTERMEDIATE: "lilac", ADVANCED: "sun" } as const;

function LevelBlock({ c, s, level, p }: { c: string; s: string; level: LevelNode; p: TrackProgress }) {
  const core = level.modules.filter((m) => !m.branchId);
  const branch = level.modules.filter((m) => m.branchId);
  const chosen = level.branches.find((b) => b.id === level.chosenBranchId);
  const started = branch.some((m) => m.videosDone > 0 || m.submission || m.checkpointsPassed > 0);
  return (
    <li>
      <Panel tone={level.reachable ? LEVEL_TONE[level.tier] : "surface"}>
        <div className="rounded-2xl bg-card p-5 shadow-card">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge variant={level.reachable ? "ink" : "muted"}>{LEVEL_LABEL[level.tier]}</Badge>
            <h3 className="font-display text-lg font-bold">{level.title}</h3>
            {level.complete && !p.preview ? <Badge variant="mint">Complete</Badge> : null}
          </div>

          {!level.reachable ? (
            <p className="flex items-center gap-2 rounded-xl bg-surface px-4 py-3 text-sm text-muted-foreground">
              <Lock className="size-4 shrink-0" />
              {level.hiddenModules ? `${level.hiddenModules} modules. ` : ""}A mentor moves you up when you&rsquo;ve finished the level below.
            </p>
          ) : (
            <>
              <ModuleList c={c} s={s} modules={core} />
              {level.branches.length ? (
                <div className="mt-4 border-t border-border pt-4">
                  <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                    <GitFork className="size-4" /> {p.preview ? "Options" : chosen ? `Your option: ${chosen.title}` : "Pick your option"}
                  </h4>
                  {!p.preview && p.enrollment && (!chosen || !started) ? (
                    <div className="mb-3">
                      <BranchPicker c={c} s={s} enrollmentId={p.enrollment.id} branches={level.branches} chosenId={level.chosenBranchId} canSwitch={!started} />
                      {chosen && !started ? <p className="mt-2 text-xs text-muted-foreground">You can switch until you start it. After that, ask a mentor.</p> : null}
                    </div>
                  ) : null}
                  <ModuleList c={c} s={s} modules={branch} branchTitles={p.preview ? level.branches : undefined} />
                </div>
              ) : null}
            </>
          )}
        </div>
      </Panel>
    </li>
  );
}

function ModuleList({ c, s, modules, branchTitles }: { c: string; s: string; modules: ModuleNode[]; branchTitles?: { id: string; title: string }[] }) {
  if (!modules.length) return null;
  return (
    <ol className="grid gap-2">
      {modules.map((m) => {
        const state = m.complete ? "done" : m.placedOut ? "placed" : m.locked ? "locked" : "open";
        const body = (
          <>
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-xl",
                state === "done" && "bg-mint text-white",
                state === "open" && "bg-primary text-primary-foreground",
                state === "locked" && "bg-surface text-muted-foreground",
                state === "placed" && "bg-lilac-soft text-lilac-foreground",
              )}
            >
              {state === "done" ? <Check className="size-4" strokeWidth={3} /> : state === "locked" ? <Lock className="size-4" /> : state === "placed" ? <FastForward className="size-4" /> : <CircleDot className="size-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{m.title}</span>
              <span className="block text-xs text-muted-foreground">
                {state === "placed"
                  ? "Placed out: open any time, no points"
                  : `${m.videosDone}/${m.videos} videos · ${m.checkpointsPassed}/${m.checkpoints} checkpoints · ${
                      m.submission?.status === "APPROVED" ? "project approved" : m.submission?.status === "PENDING" ? "project in review" : m.submission?.status === "NEEDS_REVISION" ? "changes requested" : "project to do"
                    }`}
                {branchTitles && m.branchId ? ` · ${branchTitles.find((b) => b.id === m.branchId)?.title}` : ""}
              </span>
            </span>
            {state !== "locked" ? <ArrowRight className="size-4 text-muted-foreground" /> : null}
          </>
        );
        return (
          <li key={m.id}>
            {state === "locked" ? (
              <div className="flex items-center gap-3 rounded-xl border border-border p-3 opacity-70" aria-disabled>
                {body}
              </div>
            ) : (
              <Link href={`/c/${c}/${s}/modules/${m.id}`} className="flex items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-surface">
                {body}
              </Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}
