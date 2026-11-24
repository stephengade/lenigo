import Link from "next/link";
import { ArrowRight, BookOpen, Check, Flame, LibraryBig, Map, PenLine, Trophy, UserPlus, Users } from "lucide-react";
import { PageHeader, Panel, StatTile } from "@/components/page-header";
import { UserAvatar } from "@/components/user-avatar";
import { RoleBadge } from "@/components/role-badge";
import { pageSpace } from "@/server/auth/guards";
import { listSpaceMembers } from "@/server/services/communities";
import { space as rules } from "@/lib/permissions";
import { POINT_SOURCES } from "@/lib/points";
import { cn } from "@/lib/utils";

export const metadata = { title: "Home" };

export default async function SpaceHomePage({ params }: { params: Promise<{ community: string; space: string }> }) {
  const { community: c, space: s } = await params;
  const { space, user, spaceRole } = await pageSpace(c, s);
  const members = await listSpaceMembers(space.id);
  const team = members.filter((m) => m.role !== "MEMBER");
  const learners = members.length - team.length;
  const base = `/c/${c}/${s}`;
  const firstName = user.name?.split(" ")[0] ?? "there";

  const setup = [
    { done: team.some((m) => m.role === "MANAGER" || m.role === "MENTOR"), label: "Invite managers and mentors", href: `${base}/team`, icon: UserPlus, show: rules.canViewTeam(spaceRole) },
    { done: false, label: "Build the first track", href: `${base}/curriculum`, icon: LibraryBig, show: rules.canEditCurriculum(spaceRole) },
    { done: learners > 0, label: "Invite your first learners", href: `${base}/team`, icon: UserPlus, show: rules.canViewTeam(spaceRole) },
  ].filter((x) => x.show);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={space.name} title={`Hey ${firstName}`} description={space.description ?? undefined} />

      {/* Stats. Points come from the twice-daily leaderboard snapshot, never the live ledger. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={<Flame />} tone="sun" label="Current streak" value="0 days" hint="Post a standup to start one" />
        <StatTile icon={<Trophy />} tone="rose" label="Points" value="0" hint="Board updates 7 AM & 7 PM" />
        <StatTile icon={<BookOpen />} tone="lilac" label="Learners" value={learners} />
        <StatTile icon={<Users />} tone="mint" label="Team" value={team.length} hint="Leads, managers and mentors" />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* Daily standup */}
        <Panel tone="sage">
          <div className="rounded-2xl bg-card p-6 shadow-card">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <span className="grid size-8 place-items-center rounded-xl bg-mint-soft text-mint-foreground">
                <PenLine className="size-4" />
              </span>
              Daily standup
            </div>
            <h2 className="mt-4 font-display text-2xl font-bold">What did you build or learn today?</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Thirty seconds a day: what you did, your next step, and anything blocking you. It counts towards your points and keeps
              your streak alive.
            </p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-sm font-medium text-muted-foreground">
              Standups open in phase 3
            </div>
          </div>
        </Panel>

        {/* What earns points: sources only, never values */}
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
            <p className="mt-4 rounded-xl bg-surface p-3 text-xs text-muted-foreground">
              Exact values aren&rsquo;t published, so the board rewards real work.
            </p>
          </div>
        </Panel>
      </div>

      {setup.length ? (
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
                    <span
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-xl text-xs font-bold",
                        step.done ? "bg-mint text-white" : "bg-secondary text-secondary-foreground",
                      )}
                    >
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
              <h2 className="font-display text-lg font-bold">Your roadmap</h2>
              <Link href={`${base}/roadmap`} className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                Open <ArrowRight className="size-3.5" />
              </Link>
            </div>
            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              <Map className="size-5 shrink-0" />
              Tracks, levels and modules arrive in phase 2. Your active module will show here.
            </div>
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
