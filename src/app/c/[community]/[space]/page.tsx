import Link from "next/link";
import { ArrowRight, Check, Flame, LibraryBig, Map, PenLine, UserPlus } from "lucide-react";
import { PageHeader, StatTile } from "@/components/page-header";
import { UserAvatar } from "@/components/user-avatar";
import { RoleBadge } from "@/components/role-badge";
import { pageSpace } from "@/server/auth/guards";
import { listSpaceMembers } from "@/server/services/communities";
import { space as rules } from "@/lib/permissions";
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
    <div className="space-y-8">
      <PageHeader eyebrow={space.name} title={`Good to see you, ${firstName}.`} description={space.description ?? undefined} />

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <section className="relative overflow-hidden rounded-2xl border bg-primary p-6 text-primary-foreground">
          <div className="pointer-events-none absolute -top-16 -right-16 size-56 rounded-full bg-ember/30 blur-3xl" />
          <div className="relative flex items-center gap-2 font-mono text-[11px] tracking-wider text-primary-foreground/60 uppercase">
            <PenLine className="size-3.5" /> Daily standup
          </div>
          <h2 className="relative mt-3 text-2xl font-bold">What did you build or learn today?</h2>
          <p className="relative mt-2 max-w-md text-sm text-primary-foreground/70">
            Thirty seconds a day: what you did, your next step, and anything blocking you. Earns +10 pts and keeps your streak alive.
          </p>
          <div className="relative mt-6 inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-primary-foreground/80">
            Standups open in Phase 3
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <StatTile label="Streak" value={<span className="inline-flex items-center gap-1.5"><Flame className="size-6 text-ember" />0d</span>} hint="Check in daily to start one" />
          <StatTile label="Points" value="0" accent hint="This week" />
          <StatTile label="Learners" value={learners} />
          <StatTile label="Team" value={team.length} hint="Leads, managers, mentors" />
        </section>
      </div>

      {setup.length ? (
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="text-base font-bold">Set up {space.name}</h2>
          <p className="text-sm text-muted-foreground">A few steps before your first cohort starts.</p>
          <ol className="mt-4 grid gap-2 sm:grid-cols-3">
            {setup.map((step, i) => (
              <li key={step.label}>
                <Link
                  href={step.href}
                  className={cn(
                    "group flex h-full items-center gap-3 rounded-xl border p-3 text-sm transition-colors hover:bg-muted/50",
                    step.done && "border-moss/30 bg-moss-soft/40",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full border font-mono text-xs",
                      step.done ? "border-moss bg-moss text-white" : "text-muted-foreground",
                    )}
                  >
                    {step.done ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  <span className="flex-1 font-medium">{step.label}</span>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">Your roadmap</h2>
            <Link href={`${base}/roadmap`} className="text-sm text-muted-foreground hover:text-foreground">
              Open <ArrowRight className="inline size-3.5" />
            </Link>
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            <Map className="size-5 shrink-0" />
            Tracks, levels and modules arrive in Phase 2. Your active module will show here.
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-5">
          <h2 className="text-base font-bold">Your team</h2>
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
        </section>
      </div>
    </div>
  );
}
