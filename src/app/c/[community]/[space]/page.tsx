import Link from "next/link";
import { ArrowRight, BookOpen, Check, Flame, LibraryBig, Map, PenLine, Rocket, Trophy, UserPlus, Users } from "lucide-react";
import { PageHeader, Panel, StatTile } from "@/components/page-header";
import { ButtonLink } from "@/components/button-link";
import { Progress } from "@/components/form-field";
import { UserAvatar } from "@/components/user-avatar";
import { RoleBadge } from "@/components/role-badge";
import { StandupForm } from "@/components/social/social";
import { pageSpace, titleNames } from "@/server/auth/guards";
import { spaceTeamSummary } from "@/server/services/communities";
import { listTracks } from "@/server/services/curriculum";
import { getRoadmap } from "@/server/services/learning";
import { getStanding, getStreak, getTodayStandup } from "@/server/services/social";
import type { MemberAccess } from "@/server/auth/access";
import { space as rules } from "@/lib/permissions";
import { POINT_SOURCES } from "@/lib/points";
import { nextLeaderboardUpdate } from "@/lib/leaderboard";
import { cn } from "@/lib/utils";
import { learnPath } from "@/lib/module-steps";

// The space layout's title template only covers child pages, so this page names the space itself.
export async function generateMetadata({ params }: { params: Promise<{ community: string; space: string }> }) {
  const { community, space } = await params;
  const n = await titleNames(community, space);
  return { title: n ? `${n.space} · ${n.community}` : "Home" };
}

export default async function SpaceHomePage({ params }: { params: Promise<{ community: string; space: string }> }) {
  const { community: c, space: s } = await params;
  const raw = await pageSpace(c, s);
  // The layout shows a join gate when there's no role, so this page only renders for members.
  if (!raw.spaceRole) return null;
  const access = raw as MemberAccess;
  const { space, user, spaceRole } = access;
  const base = `/c/${c}/${s}`;
  const firstName = user.name?.split(" ")[0] ?? "there";

  const [{ team, learners }, tracks, roadmap, streak, standing, today] = await Promise.all([
    spaceTeamSummary(space.id),
    listTracks(space.id),
    getRoadmap(access),
    getStreak(access),
    getStanding(space.id, user.id),
    getTodayStandup(access),
  ]);
  const active = roadmap.progress.find((p) => p.activeModuleId) ?? roadmap.progress[0] ?? null;
  const activeModule = active?.levels.flatMap((l) => l.modules).find((m) => m.id === active.activeModuleId) ?? null;
  const openModules = roadmap.progress.flatMap((p) => p.levels.flatMap((l) => l.modules.filter((m) => !m.locked && !m.complete).map((m) => ({ id: m.id, title: m.title }))));
  const isLearner = spaceRole === "MEMBER";
  const nextBoard = new Intl.DateTimeFormat("en-GB", { timeZone: access.community.timezone, hour: "numeric", minute: "2-digit" }).format(nextLeaderboardUpdate());

  const setup = [
    { done: team.some((m) => m.role === "MANAGER" || m.role === "MENTOR"), label: "Invite managers and mentors", href: `${base}/team`, icon: UserPlus, show: rules.canViewTeam(spaceRole) },
    { done: tracks.some((t) => t.isPublished), label: "Publish the first track", href: `${base}/curriculum`, icon: LibraryBig, show: rules.canEditCurriculum(spaceRole) },
    { done: learners > 0, label: "Invite your first learners", href: `${base}/team`, icon: UserPlus, show: rules.canViewTeam(spaceRole) },
  ].filter((x) => x.show);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={space.name} title={`Hey ${firstName}`} description={space.description ?? undefined} />

      {isLearner && !roadmap.enrollments.length ? (
        <div className="flex flex-wrap items-center gap-4 rounded-3xl bg-ink p-6 text-ink-foreground">
          <Rocket className="size-7 shrink-0" />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-black tracking-tight uppercase">Pick your track</h2>
            <p className="text-sm text-ink-foreground/70">Four quick questions, then your roadmap is ready.</p>
          </div>
          <ButtonLink href={`${base}/onboarding`} variant="secondary">
            Get started <ArrowRight />
          </ButtonLink>
        </div>
      ) : null}

      {/* Points and rank come from the twice-daily leaderboard snapshot, never the live ledger. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile icon={<Flame />} tone="sun" label="Current streak" value={`${streak.current} ${streak.current === 1 ? "day" : "days"}`} hint={streak.longest ? `Best: ${streak.longest}` : "Post a standup to start one"} />
        <StatTile
          icon={<Trophy />}
          tone="rose"
          label="Points"
          value={standing ? standing.points.toLocaleString() : "–"}
          hint={standing ? `Rank #${standing.rank} · next update ${nextBoard}` : `First board at ${nextBoard}`}
        />
        <StatTile icon={<BookOpen />} tone="lilac" label="Learners" value={learners} />
        <StatTile icon={<Users />} tone="mint" label="Team" value={team.length} hint="Leads, managers and mentors" />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Panel tone="sage">
          <div className="rounded-2xl bg-card p-6 shadow-card">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <span className="grid size-8 place-items-center rounded-xl bg-mint-soft text-mint-foreground">
                <PenLine className="size-4" />
              </span>
              Daily standup
            </div>
            {today ? (
              <>
                <h2 className="mt-4 font-display text-2xl font-bold">Posted for today</h2>
                <p className="mt-2 text-sm whitespace-pre-wrap text-muted-foreground">{today.didToday}</p>
                <Link href={`${base}/feed`} className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                  See the feed <ArrowRight className="size-3.5" />
                </Link>
              </>
            ) : (
              <>
                <h2 className="mt-4 mb-4 font-display text-2xl font-bold">What did you build or learn today?</h2>
                <StandupForm c={c} s={s} modules={openModules} />
              </>
            )}
          </div>
        </Panel>

        <Panel>
          <div className="rounded-2xl bg-card p-5 shadow-card">
            <h2 className="font-display text-lg font-bold">How you earn points</h2>
            <ul className="mt-3 grid gap-2">
              {POINT_SOURCES.map((p) => (
                <li key={p.key} className="flex items-start gap-2.5 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-mint" strokeWidth={3} />
                  <span>{p.label}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 rounded-xl bg-surface p-3 text-xs text-muted-foreground">Exact values aren&rsquo;t published, so the board rewards real work.</p>
          </div>
        </Panel>
      </div>

      {setup.length && setup.some((x) => !x.done) ? (
        <Panel>
          <div className="rounded-2xl bg-card p-5 shadow-card">
            <h2 className="font-display text-lg font-bold">Set up {space.name}</h2>
            <p className="text-sm text-muted-foreground">A few steps before your first cohort starts.</p>
            <ol className="mt-4 grid gap-2 sm:grid-cols-3">
              {setup.map((step, i) => (
                <li key={step.label}>
                  <Link
                    href={step.href}
                    className={cn(
                      "group flex h-full items-center gap-3 rounded-2xl border p-3.5 text-sm transition-colors hover:bg-surface/60",
                      step.done ? "border-mint/40 bg-mint-soft/50" : "border-border",
                    )}
                  >
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-xl text-xs font-bold", step.done ? "bg-mint text-white" : "bg-secondary text-secondary-foreground")}>
                      {step.done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
                    </span>
                    <span className="flex-1 font-medium">{step.label}</span>
                    <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </Panel>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel>
          <div className="rounded-2xl bg-card p-5 shadow-card">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">{isLearner ? "Your roadmap" : "Roadmap"}</h2>
              <Link href={`${base}/roadmap`} className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                Open <ArrowRight className="size-3.5" />
              </Link>
            </div>
            {active ? (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{active.track.title}</span>
                  <span className="text-xs text-muted-foreground tabular">
                    {active.totals.complete}/{active.totals.modules} modules
                  </span>
                </div>
                <Progress value={active.totals.modules ? (active.totals.complete / active.totals.modules) * 100 : 0} tone="mint" />
                {activeModule ? (
                  <Link href={learnPath(base, active.track.slug, activeModule.slug)} className="flex items-center gap-3 rounded-2xl bg-surface p-3 hover:bg-accent">
                    <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
                      <Map className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-muted-foreground">Up next</span>
                      <span className="block truncate font-medium">{activeModule.title}</span>
                    </span>
                    <ArrowRight className="size-4" />
                  </Link>
                ) : active.readyForPromotion ? (
                  <p className="rounded-2xl bg-mint-soft p-3 text-sm text-mint-foreground">Level complete. Your mentor will move you up.</p>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-3 rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                <Map className="size-5 shrink-0" />
                {isLearner ? "Pick a track to see your modules here." : `${tracks.filter((t) => t.isPublished).length} published tracks. Open the roadmap to preview one as a learner.`}
              </div>
            )}
          </div>
        </Panel>

        <Panel>
          <div className="rounded-2xl bg-card p-5 shadow-card">
            <h2 className="font-display text-lg font-bold">Your team</h2>
            {team.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">No leads or mentors yet.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {team.slice(0, 6).map((m) => (
                  <li key={m.userId} className="flex items-center gap-3">
                    <UserAvatar name={m.name} email={m.email} src={m.avatarUrl} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{m.name ?? m.email}</div>
                      {m.githubUsername ? <div className="truncate text-xs text-muted-foreground">@{m.githubUsername}</div> : null}
                    </div>
                    <RoleBadge role={m.role} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
