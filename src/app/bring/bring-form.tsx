"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/form-field";
import { useApiAction } from "@/components/use-api-action";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const SIZES = ["Under 50", "50–200", "200–1,000", "Over 1,000"] as const;

export function BringForm() {
  const { pending, run } = useApiAction();
  const [sent, setSent] = useState(false);
  const [size, setSize] = useState<string>("");
  const [f, setF] = useState({ name: "", email: "", communityName: "", location: "", about: "", link: "", website: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((v) => ({ ...v, [k]: e.target.value }));

  if (sent) {
    return (
      <div className="rounded-3xl bg-card p-8 text-center shadow-card ring-1 ring-foreground/5">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-mint text-white">
          <Check strokeWidth={3} />
        </div>
        <h2 className="mt-5 font-display text-2xl font-black uppercase">Thanks, we&rsquo;ve got it</h2>
        <p className="mt-2 text-muted-foreground">
          Someone from the Lenigo team will email <span className="font-medium text-foreground">{f.email}</span> within a few days to set up{" "}
          {f.communityName}.
        </p>
      </div>
    );
  }

  return (
    <form
      className="space-y-5 rounded-3xl bg-card p-6 shadow-card ring-1 ring-foreground/5 sm:p-8"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () =>
            api["community-requests"].post({
              ...f,
              size,
              location: f.location || null,
              link: f.link || null,
              website: f.website || null,
            }),
          { refresh: false, onDone: () => setSent(true) },
        );
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Your name" htmlFor="br-name">
          <Input id="br-name" required minLength={2} maxLength={80} autoComplete="name" value={f.name} onChange={set("name")} />
        </Field>
        <Field label="Email" htmlFor="br-email" hint="We'll reply here.">
          <Input id="br-email" type="email" required maxLength={254} autoComplete="email" value={f.email} onChange={set("email")} />
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Community name" htmlFor="br-community">
          <Input id="br-community" required minLength={2} maxLength={120} placeholder="GDG OAU" value={f.communityName} onChange={set("communityName")} />
        </Field>
        <Field label="Where (optional)" htmlFor="br-where">
          <Input id="br-where" maxLength={120} placeholder="City, campus or online" value={f.location} onChange={set("location")} />
        </Field>
      </div>
      <fieldset className="space-y-1.5">
        <legend className="mb-1.5 block text-sm font-medium">How many members?</legend>
        <div className="flex flex-wrap gap-2">
          {SIZES.map((s) => (
            <label
              key={s}
              className={cn(
                "inline-flex h-9 cursor-pointer items-center rounded-full px-4 text-sm font-medium ring-1 transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-ring/25",
                size === s ? "bg-foreground text-background ring-foreground" : "bg-card text-muted-foreground ring-foreground/10 hover:text-foreground",
              )}
            >
              <input type="radio" name="size" value={s} required className="sr-only" checked={size === s} onChange={() => setSize(s)} />
              {s}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="What do you want to learn together?" htmlFor="br-about" hint="Tracks you'd run, how you meet, who'd mentor. A few sentences is plenty.">
        <Textarea id="br-about" required minLength={20} maxLength={2000} rows={4} value={f.about} onChange={set("about")} />
      </Field>
      <Field label="Link (optional)" htmlFor="br-link" hint="Your community's page, if it has one.">
        <Input id="br-link" type="url" pattern="https://.*" maxLength={300} placeholder="https://" value={f.link} onChange={set("link")} />
      </Field>
      {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="br-website">Website</label>
        <input id="br-website" tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} />
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null} Send request
      </Button>
      <p className="text-center text-xs text-muted-foreground">We only use this to reply to you about setting up your community.</p>
    </form>
  );
}
