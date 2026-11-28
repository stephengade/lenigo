"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldError, invalid } from "@/components/form-field";
import { useApiAction } from "@/components/use-api-action";
import { useZodForm } from "@/components/use-zod-form";
import { api } from "@/lib/api";
import { bringSchema, COMMUNITY_SIZES } from "@/lib/schemas";
import { cn } from "@/lib/utils";

export function BringForm() {
  const { pending, run } = useApiAction();
  const [sent, setSent] = useState<{ email: string; communityName: string } | null>(null);
  const form = useZodForm(bringSchema, { name: "", email: "", communityName: "", location: "", size: "", about: "", link: "", website: "" });
  const { register, formState } = form;
  const err = (k: keyof typeof formState.errors) => formState.errors[k]?.message;
  const size = form.watch("size");

  if (sent) {
    return (
      <div className="rounded-3xl bg-card p-8 text-center shadow-card ring-1 ring-foreground/5">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-mint text-white">
          <Check strokeWidth={3} />
        </div>
        <h2 className="mt-5 font-display text-2xl font-black uppercase">Thanks, we&rsquo;ve got it</h2>
        <p className="mt-2 text-muted-foreground">
          Someone from the Lenigo team will email <span className="font-medium text-foreground">{sent.email}</span> within a few days to set up {sent.communityName}.
        </p>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="space-y-5 rounded-3xl bg-card p-6 shadow-card ring-1 ring-foreground/5 sm:p-8"
      onSubmit={form.handleSubmit((v) =>
        run(() => api["community-requests"].post({ ...v, website: v.website || null }), {
          refresh: false,
          onDone: () => setSent({ email: v.email, communityName: v.communityName }),
        }),
      )}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Your name" htmlFor="br-name" error={err("name")}>
          <Input id="br-name" maxLength={80} autoComplete="name" {...register("name")} {...invalid("br-name", err("name"))} />
        </Field>
        <Field label="Email" htmlFor="br-email" hint="We'll reply here." error={err("email")}>
          <Input id="br-email" type="email" maxLength={254} autoComplete="email" {...register("email")} {...invalid("br-email", err("email"))} />
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Community name" htmlFor="br-community" error={err("communityName")}>
          <Input id="br-community" maxLength={120} placeholder="GDG OAU" {...register("communityName")} {...invalid("br-community", err("communityName"))} />
        </Field>
        <Field label="Where (optional)" htmlFor="br-where" error={err("location")}>
          <Input id="br-where" maxLength={120} placeholder="City, campus or online" {...register("location")} />
        </Field>
      </div>
      <fieldset className="space-y-1.5">
        <legend className="mb-1.5 block text-sm font-medium">How many members?</legend>
        <div className="flex flex-wrap gap-2">
          {COMMUNITY_SIZES.map((s) => (
            <label
              key={s}
              className={cn(
                "inline-flex h-9 cursor-pointer items-center rounded-control px-4 text-sm font-medium ring-1 transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-ring/25",
                size === s ? "bg-foreground text-background ring-foreground" : "bg-card text-muted-foreground ring-foreground/10 hover:text-foreground",
              )}
            >
              <input type="radio" value={s} className="sr-only" {...register("size")} />
              {s}
            </label>
          ))}
        </div>
        <FieldError message={err("size")} />
      </fieldset>
      <Field label="What do you want to learn together?" htmlFor="br-about" hint="Tracks you'd run, how you meet, who'd mentor. A few sentences is plenty." error={err("about")}>
        <Textarea id="br-about" maxLength={2000} rows={4} {...register("about")} {...invalid("br-about", err("about"))} />
      </Field>
      <Field label="Link (optional)" htmlFor="br-link" hint="Your community's page, if it has one." error={err("link")}>
        <Input id="br-link" type="url" maxLength={300} placeholder="https://" {...register("link")} {...invalid("br-link", err("link"))} />
      </Field>
      {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="br-hp">Leave this empty</label>
        <input id="br-hp" tabIndex={-1} autoComplete="off" data-1p-ignore data-lpignore="true" {...register("website")} />
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null} Send request
      </Button>
      <p className="text-center text-xs text-muted-foreground">We only use this to reply to you about setting up your community.</p>
    </form>
  );
}
