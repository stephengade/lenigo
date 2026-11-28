"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GitFork, Loader2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, invalid } from "@/components/form-field";
import { allValid, textError, urlError } from "@/lib/validate";
import { spaceApi, useApiAction } from "@/components/use-api-action";
import { cn } from "@/lib/utils";

/** Pick one option inside a level (e.g. React + Next.js or Vue + Nuxt). */
export function BranchPicker({
  c,
  s,
  enrollmentId,
  branches,
  chosenId,
  canSwitch,
}: {
  c: string;
  s: string;
  enrollmentId: string;
  branches: { id: string; title: string; description: string | null }[];
  chosenId: string | null;
  /** False once the learner has started their option (a mentor switches it then). */
  canSwitch: boolean;
}) {
  const { pending, run } = useApiAction();
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {branches.map((b) => {
        const chosen = b.id === chosenId;
        return (
          <button
            key={b.id}
            type="button"
            disabled={pending || chosen || (!!chosenId && !canSwitch)}
            onClick={() => {
              if (chosenId && !confirm(`Switch to ${b.title}? You can switch until you start it.`)) return;
              run(() => spaceApi(c, s).enrollments({ id: enrollmentId }).branch.post({ branchId: b.id }), { success: `You're on ${b.title}` });
            }}
            className={cn(
              "rounded-2xl border p-4 text-left transition-colors disabled:cursor-default",
              chosen ? "border-primary bg-secondary" : "border-border bg-card hover:bg-surface disabled:opacity-60 disabled:hover:bg-card",
            )}
          >
            <span className="flex items-center gap-2 font-display font-bold">
              <GitFork className="size-4" /> {b.title}
              {chosen ? <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[11px] text-primary-foreground">Your pick</span> : null}
            </span>
            {b.description ? <span className="mt-1 block text-sm text-muted-foreground">{b.description}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function StartPlacementButton({ c, s, trackId }: { c: string; s: string; trackId: string }) {
  const router = useRouter();
  const { pending, run } = useApiAction();
  return (
    <Button
      variant="ink"
      disabled={pending}
      onClick={() => {
        if (!confirm("The quiz is timed and starts now. You can take the test once every 30 days. Ready?")) return;
        run(() => spaceApi(c, s).tracks({ id: trackId }).placement.post(), { onDone: (d) => router.push(`/c/${c}/${s}/placement/${d.id}`), refresh: false });
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Rocket />} Start the placement test
    </Button>
  );
}

/** Capstone submission form. */
export function SubmitProjectForm({ c, s, moduleId, resubmit }: { c: string; s: string; moduleId: string; resubmit: boolean }) {
  const { pending, run } = useApiAction();
  const [repoUrl, setRepo] = useState("");
  const [liveUrl, setLive] = useState("");
  const [notes, setNotes] = useState("");
  const [tried, setTried] = useState(false);
  const errors = {
    repo: urlError(repoUrl, { required: true, label: "repository link" }),
    live: urlError(liveUrl, { label: "live link" }),
    notes: textError(notes, { label: "your notes", max: 2000 }),
  };
  const err = (k: keyof typeof errors) => (tried ? errors[k] : null);
  return (
    <form
      noValidate
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        if (!allValid(errors)) return;
        run(() => spaceApi(c, s).modules({ id: moduleId }).submissions.post({ repoUrl, liveUrl: liveUrl || null, notes: notes || null }), {
          success: "Submitted. A mentor will review it.",
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Code (repository link)" htmlFor="p-repo" error={err("repo")}>
          <Input id="p-repo" type="url" required placeholder="https://github.com/you/project" value={repoUrl} onChange={(e) => setRepo(e.target.value)} {...invalid("p-repo", err("repo"))} />
        </Field>
        <Field label="Live link (optional)" htmlFor="p-live" error={err("live")}>
          <Input id="p-live" type="url" placeholder="https://your-project.vercel.app" value={liveUrl} onChange={(e) => setLive(e.target.value)} {...invalid("p-live", err("live"))} />
        </Field>
      </div>
      <Field label="Notes for your mentor (optional)" htmlFor="p-notes" error={err("notes")}>
        <Textarea id="p-notes" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What you're proud of, what you'd improve, anything they should test." />
      </Field>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null} {resubmit ? "Resubmit project" : "Submit for review"}
        </Button>
      </div>
    </form>
  );
}
