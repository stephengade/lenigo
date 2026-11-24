import { format } from "date-fns";
import { Flame, GraduationCap, Sparkles } from "lucide-react";
import { EmptyState, PageHeader, Panel } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/form-field";
import { UserAvatar } from "@/components/user-avatar";
import { AddTrackDialog, PromoteDialog } from "@/components/review/mentor-actions";
import { guard, pageSpaceRole } from "@/server/auth/guards";
import { listLearners } from "@/server/services/review";
import { space as rules } from "@/lib/permissions";

export const metadata = { title: "Learners" };

export default async function LearnersPage({ params, searchParams }: { params: Promise<{ community: string; space: string }>; searchParams: Promise<{ ready?: string }> }) {
  const { community: c, space: s } = await params;
  const { ready } = await searchParams;
  const access = await pageSpaceRole(c, s, rules.canReview);
  const { learners, tracks } = await guard(() => listLearners(access));
  const canPromote = rules.canPromoteLevel(access.spaceRole);
  const canAdd = rules.canApproveExtraTrack(access.spaceRole);
  const readyCount = learners.filter((l) => l.enrollments.some((e) => e.ready)).length;
  const shown = ready ? learners.filter((l) => l.enrollments.some((e) => e.ready)) : learners;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mentors"
        title="Learners"
        description={
          canPromote
            ? "Who's where, and who's ready to move up. Promotions go one level at a time, with a reason the learner sees."
            : "Who's where in each track. Mentors and Leads promote; Managers can see progress."
        }
      />
      <div className="flex flex-wrap gap-2 text-sm">
        <a href="?" className={!ready ? "rounded-full bg-ink px-4 py-1.5 font-medium text-ink-foreground" : "rounded-full bg-surface px-4 py-1.5 font-medium text-muted-foreground"}>
          Everyone · {learners.length}
        </a>
        <a href="?ready=1" className={ready ? "rounded-full bg-ink px-4 py-1.5 font-medium text-ink-foreground" : "rounded-full bg-surface px-4 py-1.5 font-medium text-muted-foreground"}>
          Ready to move up · {readyCount}
        </a>
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={<GraduationCap />} title={ready ? "Nobody is waiting" : "No learners yet"}>
          {ready ? "Learners show up here when they finish every module in their level." : "Invite learners from the Team page, or share the space link."}
        </EmptyState>
      ) : (
        <Panel>
          <ul className="grid gap-3">
            {shown.map((l) => {
              const name = l.name ?? l.email;
              const available = tracks.filter((t) => t.isPublished && !l.enrollments.some((e) => e.trackId === t.id));
              return (
                <li key={l.id} className="rounded-2xl bg-card p-4 shadow-card">
                  <div className="flex flex-wrap items-center gap-3">
                    <UserAvatar name={l.name} email={l.email} src={l.avatarUrl} className="size-10" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{name}</div>
                      <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                        {l.githubUsername ? <span>@{l.githubUsername}</span> : null}
                        <span className="inline-flex items-center gap-1">
                          <Flame className="size-3" /> {l.streak}-day streak
                        </span>
                        <span>last standup {l.lastStandup ? format(new Date(l.lastStandup), "d MMM") : "never"}</span>
                        {l.intake ? <span>{l.intake.hoursPerWeek} h/week</span> : <span>no onboarding answers</span>}
                      </div>
                    </div>
                    {l.placement ? <Badge variant="lilac">{l.placement === "RECOMMENDED" ? "Placement: recommended" : "Placement: to review"}</Badge> : null}
                    {canAdd && available.length && l.id !== access.user.id ? <AddTrackDialog c={c} s={s} userId={l.id} learner={name} tracks={available} /> : null}
                  </div>

                  {l.enrollments.length ? (
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                      {l.enrollments.map((e) => (
                        <li key={e.id} className="rounded-xl bg-surface p-3">
                          <div className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{e.track}</span>
                            <Badge variant="ink">{e.levelTitle}</Badge>
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <Progress value={e.modules ? (e.complete / e.modules) * 100 : 0} tone="mint" className="flex-1" />
                            <span className="text-xs text-muted-foreground tabular">
                              {e.complete}/{e.modules}
                            </span>
                          </div>
                          {e.ready || (canPromote && e.nextLevelTitle && l.id !== access.user.id) ? (
                            <div className="mt-2 flex items-center gap-2">
                              <span className="inline-flex flex-1 items-center gap-1 text-xs font-medium text-mint-foreground">
                                {e.ready ? (
                                  <>
                                    <Sparkles className="size-3.5" /> Finished this level
                                  </>
                                ) : null}
                              </span>
                              {canPromote && l.id !== access.user.id && e.nextLevelTitle ? (
                                <PromoteDialog c={c} s={s} enrollmentId={e.id} learner={name} from={e.levelTitle} to={e.nextLevelTitle} />
                              ) : null}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground">Hasn&rsquo;t picked a track yet.</p>
                  )}

                  {l.intake ? (
                    <details className="mt-3 text-sm">
                      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Onboarding answers</summary>
                      <p className="mt-2 whitespace-pre-wrap">{l.intake.experience}</p>
                      {l.intake.links.length ? (
                        <ul className="mt-2 flex flex-wrap gap-3 text-xs">
                          {l.intake.links.map((href) => (
                            <li key={href}>
                              <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-primary underline">
                                {new URL(href).hostname}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
}
