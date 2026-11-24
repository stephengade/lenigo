import { CalendarClock, ExternalLink, MapPin, Mic, Video } from "lucide-react";
import { EmptyState, PageHeader, Panel } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/markdown";
import { UserAvatar } from "@/components/user-avatar";
import { CancelWorkshopButton, MarkAttendedButton, RsvpControls, ScheduleDialog } from "@/components/workshops/workshop-actions";
import { pageSpaceRole } from "@/server/auth/guards";
import { listWorkshops, myPresentableProjects } from "@/server/services/workshops";
import { space as rules } from "@/lib/permissions";

export const metadata = { title: "Workshops" };

type Session = Awaited<ReturnType<typeof listWorkshops>>["upcoming"][number];

export default async function WorkshopsPage({ params }: { params: Promise<{ community: string; space: string }> }) {
  const { community: c, space: s } = await params;
  const access = await pageSpaceRole(c, s, () => true);
  const [{ upcoming, past }, projects] = await Promise.all([listWorkshops(access), myPresentableProjects(access)]);
  const staff = rules.canMarkAttendance(access.spaceRole);
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: access.community.timezone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workshops"
        title="Sessions"
        description={`Workshops and live standup reviews. Times are in ${access.community.timezone.replace("_", " ")}. Attendance is marked by a mentor and earns points.`}
        actions={rules.canScheduleWorkshops(access.spaceRole) ? <ScheduleDialog c={c} s={s} /> : null}
      />

      {upcoming.length === 0 ? (
        <EmptyState icon={<CalendarClock />} title="Nothing scheduled">
          {rules.canScheduleWorkshops(access.spaceRole) ? "Schedule a workshop or a standup review for your learners." : "When the team schedules a session it shows up here."}
        </EmptyState>
      ) : (
        <Panel tone="lilac">
          <ol className="grid gap-3">
            {upcoming.map((w) => (
              <SessionCard key={w.id} c={c} s={s} w={w} when={fmt.format(w.startsAt)} staff={staff} projects={projects.map((p) => ({ id: p.id, module: p.module }))} selfId={access.user.id} />
            ))}
          </ol>
        </Panel>
      )}

      {past.length ? (
        <section>
          <h2 className="mb-3 font-display text-xl font-black tracking-tight uppercase">Past sessions</h2>
          <Panel>
            <ol className="grid gap-3">
              {past.map((w) => (
                <SessionCard key={w.id} c={c} s={s} w={w} when={fmt.format(w.startsAt)} staff={staff} projects={[]} selfId={access.user.id} past />
              ))}
            </ol>
          </Panel>
        </section>
      ) : null}
    </div>
  );
}

function SessionCard({
  c,
  s,
  w,
  when,
  staff,
  projects,
  selfId,
  past,
}: {
  c: string;
  s: string;
  w: Session;
  when: string;
  staff: boolean;
  projects: { id: string; module: string }[];
  selfId: string;
  past?: boolean;
}) {
  const isReview = w.kind === "STANDUP_REVIEW";
  const presenting = w.attendees.filter((a) => a.presenting);
  return (
    <li className="rounded-2xl bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-ink text-ink-foreground">{isReview ? <Mic className="size-5" /> : <CalendarClock className="size-5" />}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-lg font-bold">{w.title}</h3>
            <Badge variant={isReview ? "sun" : "lilac"}>{isReview ? "Standup review" : "Workshop"}</Badge>
            {w.started && !past ? <Badge variant="rose">Live now</Badge> : null}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>{when}</span>
            <span className="inline-flex items-center gap-1">
              {w.type === "ONLINE_CALL" ? <Video className="size-3.5" /> : <MapPin className="size-3.5" />}
              {w.type === "ONLINE_CALL" ? "Online" : w.venue}
            </span>
            <span>{w.going} going</span>
          </p>
        </div>
        {w.canManage && !w.started ? <CancelWorkshopButton c={c} s={s} workshopId={w.id} /> : null}
      </div>

      {w.agendaMd ? <Markdown source={w.agendaMd} className="mt-3 rounded-xl bg-surface p-4" /> : null}

      {!past ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <RsvpControls
            c={c}
            s={s}
            workshopId={w.id}
            going={!!w.mine}
            isReview={isReview}
            presentingId={w.mine?.presenting?.id ?? null}
            projects={projects}
            attended={!!w.mine?.attended}
          />
          {w.meetingUrl ? (
            <a href={w.meetingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary">
              Join the call <ExternalLink className="size-3.5" />
            </a>
          ) : null}
        </div>
      ) : w.mine?.attended ? (
        <p className="mt-3 text-sm font-medium text-mint-foreground">You attended</p>
      ) : null}

      {isReview && presenting.length ? (
        <div className="mt-4 border-t border-border pt-3">
          <h4 className="mb-2 text-sm font-semibold">Presenting</h4>
          <ol className="grid gap-1.5 text-sm">
            {presenting.map((a, i) => (
              <li key={a.id} className="flex items-center gap-2">
                <span className="w-5 text-xs text-muted-foreground">{i + 1}.</span>
                <span className="font-medium">{a.name ?? a.email}</span>
                <span className="text-muted-foreground">· {a.presenting!.module}</span>
                <a href={a.presenting!.repoUrl ?? undefined} target="_blank" rel="noopener noreferrer nofollow" className="text-primary">
                  <ExternalLink className="size-3.5" />
                </a>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {staff && w.attendees.length ? (
        <div className="mt-4 border-t border-border pt-3">
          <h4 className="mb-2 text-sm font-semibold">Attendance</h4>
          <ul className="grid gap-2 sm:grid-cols-2">
            {w.attendees.map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-sm">
                <UserAvatar name={a.name} email={a.email} src={a.avatarUrl} className="size-6" />
                <span className="min-w-0 flex-1 truncate">{a.name ?? a.email}</span>
                {a.attended ? (
                  <Badge variant="mint">Attended</Badge>
                ) : w.started && a.id !== selfId ? (
                  <MarkAttendedButton c={c} s={s} workshopId={w.id} userId={a.id} name={a.name ?? a.email} />
                ) : (
                  <span className="text-xs text-muted-foreground">RSVP&rsquo;d</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}
