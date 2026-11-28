"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldError, invalid } from "@/components/form-field";
import { allValid, intError, textError, urlError } from "@/lib/validate";
import { spaceApi, useApiAction } from "@/components/use-api-action";
import { INTAKE_QUESTIONS } from "@/lib/placement";
import { cn } from "@/lib/utils";

type TrackOption = { id: string; title: string; description: string | null; locked: string | null };
const Q = Object.fromEntries(INTAKE_QUESTIONS.map((q) => [q.key, q])) as Record<(typeof INTAKE_QUESTIONS)[number]["key"], (typeof INTAKE_QUESTIONS)[number]>;

export function OnboardingForm({
  c,
  s,
  tracks,
  initial,
  enrolledTrackId,
}: {
  c: string;
  s: string;
  tracks: TrackOption[];
  initial: { goalTrackId: string | null; experience: string; links: string[]; hoursPerWeek: number } | null;
  /** Already in a track: the pick here only updates the answers. */
  enrolledTrackId: string | null;
}) {
  const router = useRouter();
  const { pending, run } = useApiAction();
  const [trackId, setTrackId] = useState(enrolledTrackId ?? initial?.goalTrackId ?? tracks.find((t) => !t.locked)?.id ?? "");
  const [experience, setExperience] = useState(initial?.experience ?? "");
  const [links, setLinks] = useState<string[]>([...(initial?.links ?? []), "", "", ""].slice(0, 3));
  const [hours, setHours] = useState(String(initial?.hoursPerWeek ?? 6));
  const [tried, setTried] = useState(false);
  const linkErrors = links.map((l) => urlError(l));
  const errors = {
    track: trackId ? null : "Pick the track you want to start with.",
    experience: textError(experience, { label: "a little about your experience", min: 10, max: 2000 }),
    links: linkErrors.find(Boolean) ?? null,
    hours: intError(hours, { label: "hours per week", min: 1, max: 80, required: true }),
  };
  const err = (k: keyof typeof errors) => (tried ? errors[k] : null);

  return (
    <form
      noValidate
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        if (!allValid(errors)) return;
        run(
          () =>
            spaceApi(c, s).onboarding.post({
              goalTrackId: trackId,
              experience,
              links: links.filter((l) => l.trim()),
              hoursPerWeek: Number(hours),
            }),
          { success: (d) => (d.enrolled ? "You're in. Here's your roadmap." : "Answers saved"), onDone: () => router.push(`/c/${c}/${s}/roadmap`) },
        );
      }}
    >
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{Q.goalTrackId.label}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {tracks.map((t) => {
            const disabled = !!t.locked || (!!enrolledTrackId && t.id !== enrolledTrackId);
            const active = trackId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                disabled={disabled}
                onClick={() => setTrackId(t.id)}
                className={cn(
                  "relative rounded-2xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                  active ? "border-primary bg-secondary ring-4 ring-ring/15" : "border-border bg-card hover:bg-surface",
                )}
                aria-pressed={active}
              >
                <span className="flex items-center gap-2 font-display font-bold">
                  {t.title}
                  {active ? <Check className="ml-auto size-4 text-primary" strokeWidth={3} /> : null}
                  {t.locked ? <Lock className="ml-auto size-3.5" /> : null}
                </span>
                {t.description ? <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">{t.description}</span> : null}
                {t.locked ? <span className="mt-2 block text-xs font-medium text-muted-foreground">{t.locked}</span> : null}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">{enrolledTrackId ? "You're already in a track. A mentor can add you to another one." : Q.goalTrackId.hint}</p>
        <FieldError message={err("track")} />
      </fieldset>

      <Field label={Q.experience.label} hint={Q.experience.hint} htmlFor="ob-exp" error={err("experience")}>
        <Textarea id="ob-exp" rows={4} required minLength={10} maxLength={2000} value={experience} onChange={(e) => setExperience(e.target.value)} {...invalid("ob-exp", err("experience"))} />
      </Field>

      <Field label={Q.links.label} hint={Q.links.hint} error={err("links")}>
        <div className="grid gap-2">
          {links.map((l, i) => (
            <Input
              key={i}
              type="url"
              aria-label={`Link ${i + 1}`}
              placeholder={i === 0 ? "https://github.com/you" : "https://…"}
              value={l}
              maxLength={300}
              onChange={(e) => setLinks(links.map((x, j) => (j === i ? e.target.value : x)))}
              aria-invalid={tried && !!linkErrors[i] ? true : undefined}
            />
          ))}
        </div>
      </Field>

      <Field label={Q.hoursPerWeek.label} hint={Q.hoursPerWeek.hint} htmlFor="ob-hours" className="max-w-xs" error={err("hours")}>
        <Input id="ob-hours" type="number" min={1} max={80} required value={hours} onChange={(e) => setHours(e.target.value)} {...invalid("ob-hours", err("hours"))} />
      </Field>

      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null} {enrolledTrackId ? "Save answers" : "Start learning"}
        </Button>
      </div>
    </form>
  );
}
