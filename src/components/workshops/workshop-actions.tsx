"use client";

import { useState } from "react";
import { Check, Loader2, Plus, Trash2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, invalid, NativeSelect } from "@/components/form-field";
import { allValid, isPast, textError, urlError } from "@/lib/validate";
import { spaceApi, useApiAction } from "@/components/use-api-action";
import { cn } from "@/lib/utils";

type Scope = { c: string; s: string };

/** datetime-local works in the viewer's own timezone; the server stores UTC. */
const toIso = (local: string) => (local ? new Date(local).toISOString() : null);

export function ScheduleDialog({ c, s }: Scope) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useApiAction();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"WORKSHOP" | "STANDUP_REVIEW">("WORKSHOP");
  const [type, setType] = useState<"ONLINE_CALL" | "PHYSICAL">("ONLINE_CALL");
  const [startsAt, setStarts] = useState("");
  const [endsAt, setEnds] = useState("");
  const [meetingUrl, setUrl] = useState("");
  const [venue, setVenue] = useState("");
  const [agenda, setAgenda] = useState("");
  const [tried, setTried] = useState(false);
  /** Checked on submit (reading the clock while rendering isn't allowed). */
  const [inPast, setInPast] = useState(false);
  const start = startsAt ? new Date(startsAt) : null;
  const end = endsAt ? new Date(endsAt) : null;
  const errors = {
    title: textError(title, { label: "a title", min: 3, max: 120 }),
    start: !start || Number.isNaN(start.getTime()) ? "Pick when it starts." : inPast ? "That time has already passed." : null,
    end: end && start && !Number.isNaN(end.getTime()) && end <= start ? "The end must be after the start." : null,
    url: type === "ONLINE_CALL" ? urlError(meetingUrl, { required: true, label: "call link" }) : null,
    venue: type === "PHYSICAL" ? textError(venue, { label: "the venue", min: 2, max: 200 }) : null,
    agenda: textError(agenda, { label: "the agenda", max: 4000 }),
  };
  const err = (k: keyof typeof errors) => (tried ? errors[k] : null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus /> Schedule
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setTried(true);
            const past = !!start && isPast(start);
            setInPast(past);
            if (past || !allValid(errors)) return;
            run(
              () =>
                spaceApi(c, s).workshops.post({
                  title,
                  kind,
                  type,
                  startsAt: toIso(startsAt)!,
                  endsAt: toIso(endsAt),
                  meetingUrl: type === "ONLINE_CALL" ? meetingUrl : null,
                  venue: type === "PHYSICAL" ? venue : null,
                  agendaMd: agenda || null,
                }),
              { success: "Scheduled", onDone: () => setOpen(false) },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>Schedule a session</DialogTitle>
            <DialogDescription>Workshops teach something. Standup reviews are live sessions where learners present their progress.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-1 rounded-full bg-surface p-1 text-sm">
            {(
              [
                ["WORKSHOP", "Workshop"],
                ["STANDUP_REVIEW", "Standup review"],
              ] as const
            ).map(([v, l]) => (
              <button key={v} type="button" onClick={() => setKind(v)} className={cn("rounded-full px-3 py-1.5 font-medium", kind === v ? "bg-ink text-ink-foreground" : "text-muted-foreground")}>
                {l}
              </button>
            ))}
          </div>
          <Field label="Title" htmlFor="w-title" error={err("title")}>
            <Input id="w-title" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} {...invalid("w-title", err("title"))} placeholder={kind === "WORKSHOP" ? "Intro to Git and GitHub" : "Friday demo session"} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Starts" htmlFor="w-start" error={err("start")}>
              <Input id="w-start" type="datetime-local" required value={startsAt} onChange={(e) => {
                  setStarts(e.target.value);
                  setInPast(false);
                }}
                {...invalid("w-start", err("start"))} />
            </Field>
            <Field label="Ends (optional)" htmlFor="w-end" error={err("end")}>
              <Input id="w-end" type="datetime-local" min={startsAt || undefined} value={endsAt} onChange={(e) => setEnds(e.target.value)} {...invalid("w-end", err("end"))} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
            <Field label="Where" htmlFor="w-type">
              <NativeSelect id="w-type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
                <option value="ONLINE_CALL">Online call</option>
                <option value="PHYSICAL">In person</option>
              </NativeSelect>
            </Field>
            {type === "ONLINE_CALL" ? (
              <Field label="Call link" htmlFor="w-url" hint="Only people who RSVP see it." error={err("url")}>
                <Input id="w-url" type="url" required value={meetingUrl} onChange={(e) => setUrl(e.target.value)} placeholder="https://meet.google.com/…" {...invalid("w-url", err("url"))} />
              </Field>
            ) : (
              <Field label="Venue" htmlFor="w-venue" error={err("venue")}>
                <Input id="w-venue" required maxLength={200} value={venue} onChange={(e) => setVenue(e.target.value)} {...invalid("w-venue", err("venue"))} />
              </Field>
            )}
          </div>
          <Field label="Agenda (optional)" htmlFor="w-agenda" error={err("agenda")}>
            <Textarea id="w-agenda" rows={3} maxLength={4000} value={agenda} onChange={(e) => setAgenda(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null} Schedule
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RsvpControls({
  c,
  s,
  workshopId,
  going,
  isReview,
  presentingId,
  projects,
  attended,
}: Scope & {
  workshopId: string;
  going: boolean;
  isReview: boolean;
  presentingId: string | null;
  projects: { id: string; module: string }[];
  attended: boolean;
}) {
  const { pending, run } = useApiAction();
  const [project, setProject] = useState(presentingId ?? "");
  if (attended)
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-mint-foreground">
        <Check className="size-4 text-mint" /> Attended
      </span>
    );
  const send = (g: boolean) => run(() => spaceApi(c, s).workshops({ id: workshopId }).rsvp.post({ going: g, submissionId: g && isReview ? project || null : null }), { success: g ? "You're going" : "RSVP cancelled" });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {isReview && projects.length ? (
        <NativeSelect aria-label="Project to present" value={project} onChange={(e) => setProject(e.target.value)} className="h-8 w-auto text-xs">
          <option value="">Just watching</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              Present: {p.module}
            </option>
          ))}
        </NativeSelect>
      ) : null}
      {going ? (
        <>
          {isReview && project !== (presentingId ?? "") ? (
            <Button size="sm" disabled={pending} onClick={() => send(true)}>
              Update
            </Button>
          ) : null}
          <Button size="sm" variant="outline" disabled={pending} onClick={() => send(false)}>
            {pending ? <Loader2 className="animate-spin" /> : null} Can&rsquo;t make it
          </Button>
        </>
      ) : (
        <Button size="sm" disabled={pending} onClick={() => send(true)}>
          {pending ? <Loader2 className="animate-spin" /> : null} I&rsquo;m going
        </Button>
      )}
    </div>
  );
}

export function MarkAttendedButton({ c, s, workshopId, userId, name }: Scope & { workshopId: string; userId: string; name: string }) {
  const { pending, run } = useApiAction();
  return (
    <Button
      size="xs"
      variant="outline"
      disabled={pending}
      onClick={() => confirm(`Mark ${name} as attended? This can't be undone.`) && run(() => spaceApi(c, s).workshops({ id: workshopId }).attendance.post({ userId }), { success: `${name} marked` })}
    >
      {pending ? <Loader2 className="animate-spin" /> : <UserCheck />} Attended
    </Button>
  );
}

export function CancelWorkshopButton({ c, s, workshopId }: Scope & { workshopId: string }) {
  const { pending, run } = useApiAction();
  return (
    <Button size="icon-sm" variant="ghost" aria-label="Cancel session" disabled={pending} onClick={() => confirm("Cancel this session?") && run(() => spaceApi(c, s).workshops({ id: workshopId }).delete(), { success: "Cancelled" })}>
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
    </Button>
  );
}
