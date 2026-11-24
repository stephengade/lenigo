"use client";

import { useState } from "react";
import { ArrowUpCircle, Check, Loader2, Plus, RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect } from "@/components/form-field";
import { spaceApi, useApiAction } from "@/components/use-api-action";

type Scope = { c: string; s: string };

/** Approve and score a capstone, or ask for changes. */
export function ReviewSubmissionForm({ c, s, submissionId }: Scope & { submissionId: string }) {
  const { pending, run } = useApiAction();
  const [score, setScore] = useState("");
  const [feedback, setFeedback] = useState("");
  const send = (decision: "APPROVED" | "NEEDS_REVISION") =>
    run(() => spaceApi(c, s).submissions({ id: submissionId }).review.post({ decision, score: decision === "APPROVED" ? Number(score) : null, feedback }), {
      success: decision === "APPROVED" ? "Approved and scored" : "Sent back with your feedback",
    });
  return (
    <form className="grid gap-3" onSubmit={(e) => e.preventDefault()}>
      <Field label="Feedback the learner will read" htmlFor={`fb-${submissionId}`}>
        <Textarea id={`fb-${submissionId}`} rows={3} required minLength={10} maxLength={4000} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="What works, what to improve, what to try next." />
      </Field>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Score /100" htmlFor={`sc-${submissionId}`} className="w-28">
          <Input id={`sc-${submissionId}`} type="number" min={0} max={100} value={score} onChange={(e) => setScore(e.target.value)} />
        </Field>
        <Button type="button" disabled={pending || feedback.trim().length < 10 || score === ""} onClick={() => send("APPROVED")}>
          {pending ? <Loader2 className="animate-spin" /> : <Check />} Approve
        </Button>
        <Button type="button" variant="outline" disabled={pending || feedback.trim().length < 10} onClick={() => send("NEEDS_REVISION")}>
          <RotateCcw /> Request changes
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">The score scales the points the project earns. Learners see your score and feedback; they never see point values.</p>
    </form>
  );
}

export function ReviewPlacementForm({ c, s, attemptId }: Scope & { attemptId: string }) {
  const { pending, run } = useApiAction();
  const [feedback, setFeedback] = useState("");
  const send = (decision: "RECOMMENDED" | "NOT_RECOMMENDED") =>
    run(() => spaceApi(c, s).placement({ id: attemptId }).review.post({ decision, feedback }), { success: decision === "RECOMMENDED" ? "Recommended" : "Not recommended" });
  return (
    <div className="grid gap-3">
      <Field label="Feedback" htmlFor={`pf-${attemptId}`}>
        <Textarea id={`pf-${attemptId}`} rows={3} minLength={10} maxLength={2000} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending || feedback.trim().length < 10} onClick={() => send("RECOMMENDED")}>
          <ThumbsUp /> Recommend next level
        </Button>
        <Button variant="outline" disabled={pending || feedback.trim().length < 10} onClick={() => send("NOT_RECOMMENDED")}>
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
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <ArrowUpCircle /> Promote
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
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
          <Field label="Reason (the learner sees this)" htmlFor={`pr-${enrollmentId}`}>
            <Textarea id={`pr-${enrollmentId}`} rows={3} required minLength={10} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
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
