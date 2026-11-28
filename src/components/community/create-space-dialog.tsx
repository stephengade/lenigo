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
import { useZodForm } from "@/components/use-zod-form";
import { createSpaceSchema } from "@/lib/schemas";

export function CreateSpaceDialog({ communitySlug }: { communitySlug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  /** The slug follows the name until someone edits it by hand. */
  const [slugTouched, setSlugTouched] = useState(false);
  const form = useZodForm(createSpaceSchema, { name: "", slug: "", description: "", joinPolicy: "OPEN" });
  const { register, formState } = form;
  const err = (k: keyof typeof formState.errors) => formState.errors[k]?.message;
  const joinPolicy = form.watch("joinPolicy");

  const submit = form.handleSubmit((v) => {
    start(async () => {
      const { data, error } = await api.c({ community: communitySlug }).spaces.post({
        name: v.name,
        slug: v.slug || undefined,
        description: v.description ?? undefined,
        joinPolicy: v.joinPolicy,
      });
      if (error) return void toast.error(apiError(error));
      toast.success(`${v.name} is live`);
      setOpen(false);
      router.push(`/c/${communitySlug}/${data.slug}`);
      router.refresh();
    });
  });

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
            <Input
              id="space-name"
              maxLength={60}
              placeholder="Web Development"
              {...register("name", {
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                  if (!slugTouched) form.setValue("slug", slugify(e.target.value), { shouldValidate: formState.isSubmitted });
                },
              })}
              {...invalid("space-name", err("name"))}
            />
            <FieldError id="space-name-error" message={err("name")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="space-slug">URL</Label>
            <div className="flex items-center rounded-xl border border-input bg-surface pl-4 font-mono text-xs text-muted-foreground shadow-xs focus-within:border-primary focus-within:ring-4 focus-within:ring-ring/15">
              <span className="shrink-0">/c/{communitySlug}/</span>
              <input
                id="space-slug"
                className="h-8 min-w-0 flex-1 bg-transparent pr-3 text-foreground outline-none"
                {...register("slug", { setValueAs: (v: string) => v.toLowerCase(), onChange: () => setSlugTouched(true) })}
                {...invalid("space-slug", err("slug"))}
              />
            </div>
            <FieldError id="space-slug-error" message={err("slug")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="space-desc">Description</Label>
            <Textarea id="space-desc" maxLength={300} rows={2} placeholder="HTML to full-stack: build and ship real web apps." {...register("description")} {...invalid("space-desc", err("description"))} />
            <FieldError id="space-desc-error" message={err("description")} />
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
                  onClick={() => form.setValue("joinPolicy", value)}
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
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null} Create space
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
