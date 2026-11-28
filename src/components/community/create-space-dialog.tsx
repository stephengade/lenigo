"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, apiError } from "@/lib/api";
import { cn, slugify } from "@/lib/utils";
import { FieldError, invalid } from "@/components/form-field";
import { allValid, textError } from "@/lib/validate";

export function CreateSpaceDialog({ communitySlug }: { communitySlug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [joinPolicy, setJoinPolicy] = useState<"OPEN" | "INVITE">("OPEN");

  const effectiveSlug = slugTouched ? slug : slugify(name);
  const [tried, setTried] = useState(false);
  const errors = {
    name: textError(name, { label: "the space's name", min: 2, max: 60 }),
    slug:
      !effectiveSlug || /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(effectiveSlug)
        ? null
        : "Use lowercase letters, numbers and single hyphens (not at the start or end).",
  };
  const err = (k: keyof typeof errors) => (tried ? errors[k] : null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!allValid(errors)) return;
    start(async () => {
      const { data, error } = await api.c({ community: communitySlug }).spaces.post({
        name,
        slug: effectiveSlug || undefined,
        description: description || undefined,
        joinPolicy,
      });
      if (error) return void toast.error(apiError(error));
      toast.success(`${name} is live`);
      setOpen(false);
      router.push(`/c/${communitySlug}/${data.slug}`);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus /> New space
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form noValidate onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Create a space</DialogTitle>
            <DialogDescription>A space is a track group inside your community, like Web Development or Data Science.</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="space-name">Name</Label>
            <Input id="space-name" required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Web Development" {...invalid("space-name", err("name"))} />
            <FieldError id="space-name-error" message={err("name")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="space-slug">URL</Label>
            <div className="flex items-center rounded-xl border border-input bg-surface pl-4 font-mono text-xs text-muted-foreground shadow-xs focus-within:border-primary focus-within:ring-4 focus-within:ring-ring/15">
              <span className="shrink-0">/c/{communitySlug}/</span>
              <input
                id="space-slug"
                className="h-8 min-w-0 flex-1 bg-transparent pr-3 text-foreground outline-none"
                value={effectiveSlug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value.toLowerCase());
                }}
                {...invalid("space-slug", err("slug"))}
              />
            </div>
            <FieldError id="space-slug-error" message={err("slug")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="space-desc">Description</Label>
            <Textarea id="space-desc" maxLength={300} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="HTML to full-stack: build and ship real web apps." />
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Who can join</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["OPEN", "Open", "Any community member can join"],
                  ["INVITE", "Invite only", "Join with an invite link"],
                ] as const
              ).map(([value, label, hint]) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setJoinPolicy(value)}
                  aria-pressed={joinPolicy === value}
                  className={cn(
                    "rounded-2xl border p-3.5 text-left transition-colors",
                    joinPolicy === value ? "border-primary bg-secondary" : "border-border hover:bg-surface",
                  )}
                >
                  <div className="text-sm font-medium">{label}</div>
                  <div className="text-xs text-muted-foreground">{hint}</div>
                </button>
              ))}
            </div>
          </fieldset>

          <DialogFooter>
            <Button type="submit" disabled={pending || name.trim().length < 2}>
              {pending ? <Loader2 className="animate-spin" /> : null} Create space
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
