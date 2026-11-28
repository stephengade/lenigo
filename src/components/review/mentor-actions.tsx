"use client";

import { useState } from "react";
import { ArrowUpCircle, Check, Loader2, Plus, RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldError, NativeSelect, invalid } from "@/components/form-field";
import { spaceApi, useApiAction } from "@/components/use-api-action";
import { useZodForm } from "@/components/use-zod-form";
import { addTrackSchema, placementReviewSchema, promoteSchema, reviewSchema, scoreField } from "@/lib/schemas";

type Scope = { c: string; s: string };

/** Approve and score a capstone, or ask for changes. The score is only required to approve. */
export function ReviewSubmissionForm({ c, s, submissionId }: Scope & { submissionId: string }) {
  const { pending, run } = useApiAction();
  const form = useZodForm(reviewSchema, { feedback: "", score: "" });
  const fbId = `fb-${submissionId}`;
  const scId = `sc-${submissionId}`;
  const fbError = form.formState.errors.feedback?.message;
  const scoreError = form.formState.errors.score?.message;

  const send = (decision: "APPROVED" | "NEEDS_REVISION") =>
    form.handleSubmit((v) => {
      let score: number | null = null;
      if (decision === "APPROVED") {
        const parsed = scoreField.safeParse(v.score);
        if (!parsed.success) return form.setError("score", { message: parsed.error.issues[0]?.message }, { shouldFocus: true });
        score = parsed.data;
      }
      form.clearErrors("score");
      run(() => spaceApi(c, s).submissions({ id: submissionId }).review.post({ decision, score, feedback: v.feedback }), {
        success: decision === "APPROVED" ? "Approved and scored" : "Sent back with your feedback",
      });
    })();

  return (
    <form noValidate className="grid gap-3" onSubmit={(e) => e.preventDefault()}>
      <Field label="Feedback the learner will read" htmlFor={fbId} error={fbError}>
        <Textarea id={fbId} rows={3} maxLength={4000} placeholder="What works, what to improve, what to try next." {...form.register("feedback")} {...invalid(fbId, fbError)} />
      </Field>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Score /100" htmlFor={scId} className="w-28">
          <Input id={scId} type="number" min={0} max={100} {...form.register("score")} {...invalid(scId, scoreError)} />
        </Field>
        <Button type="button" disabled={pending} onClick={() => send("APPROVED")}>
          {pending ? <Loader2 className="animate-spin" /> : <Check />} Approve
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => send("NEEDS_REVISION")}>
          <RotateCcw /> Request changes
        </Button>
      </div>
      <FieldError id={`${scId}-error`} message={scoreError} />
      <p className="text-xs text-muted-foreground">The score scales the points the project earns. Learners see your score and feedback; they never see point values.</p>
    </form>
  );
}

export function ReviewPlacementForm({ c, s, attemptId }: Scope & { attemptId: string }) {
  const { pending, run } = useApiAction();
  const form = useZodForm(placementReviewSchema, { feedback: "" });
  const id = `pf-${attemptId}`;
  const error = form.formState.errors.feedback?.message;
  const send = (decision: "RECOMMENDED" | "NOT_RECOMMENDED") =>
    form.handleSubmit((v) =>
      run(() => spaceApi(c, s).placement({ id: attemptId }).review.post({ decision, feedback: v.feedback }), {
        success: decision === "RECOMMENDED" ? "Recommended" : "Not recommended",
      }),
    )();
  return (
    <div className="grid gap-3">
      <Field label="Feedback" htmlFor={id} error={error}>
        <Textarea id={id} rows={3} maxLength={2000} {...form.register("feedback")} {...invalid(id, error)} />
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
  const form = useZodForm(promoteSchema, { reason: placementAttemptId ? "Passed the placement test and the practical task." : "" });
  const id = `pr-${enrollmentId}`;
  const error = form.formState.errors.reason?.message;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <ArrowUpCircle /> Promote
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="space-y-4"
          onSubmit={form.handleSubmit((v) =>
            run(() => spaceApi(c, s).enrollments({ id: enrollmentId }).promote.post({ reason: v.reason, placementAttemptId: placementAttemptId ?? null }), {
              success: `${learner} is now at ${to}`,
              onDone: () => setOpen(false),
            }),
          )}
        >
          <DialogHeader>
            <DialogTitle>Promote {learner}</DialogTitle>
            <DialogDescription>
              {from} → {to}. One level at a time. It&rsquo;s recorded with your name and can&rsquo;t be edited later.
            </DialogDescription>
          </DialogHeader>
          <Field label="Reason (the learner sees this)" htmlFor={id} error={error}>
            <Textarea id={id} rows={3} maxLength={500} {...form.register("reason")} {...invalid(id, error)} />
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
  const form = useZodForm(addTrackSchema, { trackId: tracks[0]?.id ?? "", note: "" });
  const noteError = form.formState.errors.note?.message;
  if (!tracks.length) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Plus /> Track
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="space-y-4"
          onSubmit={form.handleSubmit((v) => run(() => spaceApi(c, s).enrollments.post({ userId, trackId: v.trackId, note: v.note }), { success: "Added", onDone: () => setOpen(false) }))}
        >
          <DialogHeader>
            <DialogTitle>Add {learner} to a track</DialogTitle>
            <DialogDescription>Learners start one track on their own. Another one needs your approval, and its prerequisite still applies.</DialogDescription>
          </DialogHeader>
          <Field label="Track" htmlFor={`at-${userId}`} error={form.formState.errors.trackId?.message}>
            <NativeSelect id={`at-${userId}`} {...form.register("trackId")}>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Note (optional)" htmlFor={`an-${userId}`} error={noteError}>
            <Input id={`an-${userId}`} maxLength={300} {...form.register("note")} {...invalid(`an-${userId}`, noteError)} />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null} Approve track
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
