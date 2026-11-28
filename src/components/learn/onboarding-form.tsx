"use client";

import { useRouter } from "next/navigation";
import { Check, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldError, invalid } from "@/components/form-field";
import { useZodForm } from "@/components/use-zod-form";
import { onboardingSchema } from "@/lib/schemas";
import { spaceApi, useApiAction } from "@/components/use-api-action";
import { INTAKE_QUESTIONS } from "@/lib/placement";
import { cn } from "@/lib/utils";

type TrackOption = { id: string; title: string; description: string | null; locked: string | null; stacks: { slug: string; title: string; description: string | null }[] };
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
  const form = useZodForm(onboardingSchema, {
    goalTrackId: enrolledTrackId ?? initial?.goalTrackId ?? tracks.find((t) => !t.locked)?.id ?? "",
    stack: "",
    experience: initial?.experience ?? "",
    links: [...(initial?.links ?? []), "", "", ""].slice(0, 3),
    hoursPerWeek: String(initial?.hoursPerWeek ?? 6),
  });
  const { register, formState } = form;
  const trackId = form.watch("goalTrackId");
  const stack = form.watch("stack");
  // Pick once: a track with options (Node.js or Python, React or Vue) asks which one here, and it holds for every level.
  const stacks = enrolledTrackId ? [] : (tracks.find((t) => t.id === trackId)?.stacks ?? []);
  const linkErrors = [0, 1, 2].map((i) => formState.errors.links?.[i]?.message);
  const errors = {
    track: formState.errors.goalTrackId?.message,
    stack: formState.errors.stack?.message,
    experience: formState.errors.experience?.message,
    links: linkErrors.find(Boolean),
    hours: formState.errors.hoursPerWeek?.message,
  };
  const err = (k: keyof typeof errors) => errors[k];

  return (
    <form
      noValidate
      className="grid gap-6"
      onSubmit={form.handleSubmit((v) => {
        if (stacks.length && !stacks.some((x) => x.slug === v.stack)) {
          form.setError("stack", { message: "Pick the one you want to learn." });
          return;
        }
        return run(() => spaceApi(c, s).onboarding.post({ ...v, stack: stacks.length ? v.stack : null }), {
          success: (d) => (d.enrolled ? "You're in. Here's your roadmap." : "Answers saved"),
          onDone: () => router.push(`/c/${c}/${s}/roadmap`),
        });
      })}
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
                onClick={() => {
                  form.setValue("goalTrackId", t.id, { shouldValidate: formState.isSubmitted });
                  form.setValue("stack", "");
                  form.clearErrors("stack");
                }}
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

      {stacks.length ? (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Which one do you want to learn?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {stacks.map((x) => {
              const active = stack === x.slug;
              return (
                <button
                  key={x.slug}
                  type="button"
                  onClick={() => form.setValue("stack", x.slug, { shouldValidate: formState.isSubmitted })}
                  className={cn(
                    "relative rounded-2xl border p-4 text-left transition-colors",
                    active ? "border-primary bg-secondary ring-4 ring-ring/15" : "border-border bg-card hover:bg-surface",
                  )}
                  aria-pressed={active}
                >
                  <span className="flex items-center gap-2 font-display font-bold">
                    {x.title}
                    {active ? <Check className="ml-auto size-4 text-primary" strokeWidth={3} /> : null}
                  </span>
                  {x.description ? <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">{x.description}</span> : null}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">You&apos;ll only see lessons and placement questions for this one, at every level. You can switch before you start it.</p>
          <FieldError message={err("stack")} />
        </fieldset>
      ) : null}

      <Field label={Q.experience.label} hint={Q.experience.hint} htmlFor="ob-exp" error={err("experience")}>
        <Textarea id="ob-exp" rows={4} maxLength={2000} {...register("experience")} {...invalid("ob-exp", err("experience"))} />
      </Field>

      <Field label={Q.links.label} hint={Q.links.hint} error={err("links")}>
        <div className="grid gap-2">
          {[0, 1, 2].map((i) => (
            <Input
              key={i}
              type="url"
              aria-label={`Link ${i + 1}`}
              placeholder={i === 0 ? "https://github.com/you" : "https://…"}
              maxLength={300}
              {...register(`links.${i}`)}
              aria-invalid={linkErrors[i] ? true : undefined}
            />
          ))}
        </div>
      </Field>

      <Field label={Q.hoursPerWeek.label} hint={Q.hoursPerWeek.hint} htmlFor="ob-hours" className="max-w-xs" error={err("hours")}>
        <Input id="ob-hours" type="number" min={1} max={80} {...register("hoursPerWeek")} {...invalid("ob-hours", err("hours"))} />
      </Field>

      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null} {enrolledTrackId ? "Save answers" : "Start learning"}
        </Button>
      </div>
    </form>
  );
}
