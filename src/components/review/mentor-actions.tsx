"use client";

import { useState } from "react";
import { ArrowUpCircle, Check, Loader2, Plus, RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect, invalid } from "@/components/form-field";
import { intError, textError } from "@/lib/validate";
import { spaceApi, useApiAction } from "@/components/use-api-action";

type Scope = { c: string; s: string };

/** Approve and score a capstone, or ask for changes. */
export function ReviewSubmissionForm({ c, s, submissionId }: Scope & { submissionId: string }) {
  const { pending, run } = useApiAction();
  const [score, setScore] = useState("");
  const [feedback, setFeedback] = useState("");
  /** Which button was pressed, so the score is only required when approving. */
  const [tried, setTried] = useState<null | "APPROVED" | "NEEDS_REVISION">(null);
  const fbError = textError(feedback, { label: "feedback the learner can act on", min: 10, max: 4000 });
  const scoreError = intError(score, { label: "the score", min: 0, max: 100, required: true });
  const shownFb = tried ? fbError : null;
  const shownScore = tried === "APPROVED" ? scoreError : null;
  const send = (decision: "APPROVED" | "NEEDS_REVISION") => {
    setTried(decision);
    if (fbError || (decision === "APPROVED" && scoreError)) return;
    run(() => spaceApi(c, s).submissions({ id: submissionId }).review.post({ decision, score: decision === "APPROVED" ? Number(score) : null, feedback }), {
      success: decision === "APPROVED" ? "Approved and scored" : "Sent back with your feedback",
    });
  };
  return (
    <form className="grid gap-3" onSubmit={(e) => e.preventDefault()}>
      <Field label="Feedback the learner will read" htmlFor={`fb-${submissionId}`} error={shownFb}>
        <Textarea id={`fb-${submissionId}`} rows={3} required minLength={10} maxLength={4000} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="What works, what to improve, what to try next." {...invalid(`fb-${submissionId}`, shownFb)} />
      </Field>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Score /100" htmlFor={`sc-${submissionId}`} className="w-28">
          <Input id={`sc-${submissionId}`} type="number" min={0} max={100} value={score} onChange={(e) => setScore(e.target.value)} {...invalid(`sc-${submissionId}`, shownScore)} />
        </Field>
        <Button type="button" disabled={pending} onClick={() => send("APPROVED")}>
          {pending ? <Loader2 className="animate-spin" /> : <Check />} Approve
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => send("NEEDS_REVISION")}>
          <RotateCcw /> Request changes
        </Button>
      </div>
      {shownScore ? (
        <p id={`sc-${submissionId}-error`} role="alert" className="text-xs font-medium text-destructive">
          {shownScore}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">The score scales the points the project earns. Learners see your score and feedback; they never see point values.</p>
    </form>
  );
}

export function ReviewPlacementForm({ c, s, attemptId }: Scope & { attemptId: string }) {
  const { pending, run } = useApiAction();
  const [feedback, setFeedback] = useState("");
  const [tried, setTried] = useState(false);
  const fbError = tried ? textError(feedback, { label: "feedback the learner can act on", min: 10, max: 2000 }) : null;
  const send = (decision: "RECOMMENDED" | "NOT_RECOMMENDED") => {
    setTried(true);
    if (textError(feedback, { label: "feedback", min: 10, max: 2000 })) return;
    run(() => spaceApi(c, s).placement({ id: attemptId }).review.post({ decision, feedback }), { success: decision === "RECOMMENDED" ? "Recommended" : "Not recommended" });
  };
  return (
    <div className="grid gap-3">
      <Field label="Feedback" htmlFor={`pf-${attemptId}`} error={fbError}>
        <Textarea id={`pf-${attemptId}`} rows={3} minLength={10} maxLength={2000} value={feedback} onChange={(e) => setFeedback(e.target.value)} {...invalid(`pf-${attemptId}`, fbError)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => send("RECOMMENDED")}>
          <ThumbsUp /> Recommend next level
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => send("NOT_RECOMMENDED")}>
          <ThumbsDown /> Not yet
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">A recommendation doesn&rsquo;t change the level by itself: a Mentor or Lead promotes afterwards.</p>
    </div>
  );
}

/** Move a learner up one level, with a reason they'll see. Mentors and Leads only. */
export function PromoteDialog({
  c,
  s,
  enrollmentId,
  learner,
  from,
  to,
  placementAttemptId,
}: Scope & { enrollmentId: string; learner: string; from: string; to: string; placementAttemptId?: string }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useApiAction();
  const [reason, setReason] = useState(placementAttemptId ? "Passed the placement test and the practical task." : "");
  const [tried, setTried] = useState(false);
  const reasonError = textError(reason, { label: "a reason the learner will see", min: 10, max: 500 });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <ArrowUpCircle /> Promote
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setTried(true);
            if (reasonError) return;
            run(() => spaceApi(c, s).enrollments({ id: enrollmentId }).promote.post({ reason, placementAttemptId: placementAttemptId ?? null }), {
              success: `${learner} is now at ${to}`,
              onDone: () => setOpen(false),
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Promote {learner}</DialogTitle>
            <DialogDescription>
              {from} → {to}. One level at a time. It&rsquo;s recorded with your name and can&rsquo;t be edited later.
            </DialogDescription>
          </DialogHeader>
          <Field label="Reason (the learner sees this)" htmlFor={`pr-${enrollmentId}`} error={tried ? reasonError : null}>
            <Textarea id={`pr-${enrollmentId}`} rows={3} required minLength={10} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} {...invalid(`pr-${enrollmentId}`, tried ? reasonError : null)} />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null} Promote to {to}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Add a learner to another track (their first track was their own pick). */
export function AddTrackDialog({ c, s, userId, learner, tracks }: Scope & { userId: string; learner: string; tracks: { id: string; title: string }[] }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useApiAction();
  const [trackId, setTrackId] = useState(tracks[0]?.id ?? "");
  const [note, setNote] = useState("");
  if (!tracks.length) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Plus /> Track
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => spaceApi(c, s).enrollments.post({ userId, trackId, note: note || null }), { success: "Added", onDone: () => setOpen(false) });
          }}
        >
          <DialogHeader>
            <DialogTitle>Add {learner} to a track</DialogTitle>
            <DialogDescription>Learners start one track on their own. Another one needs your approval, and its prerequisite still applies.</DialogDescription>
          </DialogHeader>
          <Field label="Track" htmlFor={`at-${userId}`}>
            <NativeSelect id={`at-${userId}`} value={trackId} onChange={(e) => setTrackId(e.target.value)}>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Note (optional)" htmlFor={`an-${userId}`}>
            <Input id={`an-${userId}`} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={pending || !trackId}>
              {pending ? <Loader2 className="animate-spin" /> : null} Approve track
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
