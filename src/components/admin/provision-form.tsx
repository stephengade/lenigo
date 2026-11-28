"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ButtonLink } from "@/components/button-link";
import { api, apiError } from "@/lib/api";
import { slugify } from "@/lib/utils";
import { FieldError, invalid } from "@/components/form-field";
import { useZodForm } from "@/components/use-zod-form";
import { provisionSchema } from "@/lib/schemas";

const SUGGESTIONS = ["Web Development", "Data Science", "Mobile Development", "Cloud & DevOps", "UI/UX Design", "AI & ML"];

type Result = { slug: string; spaces: string[]; ownerInviteUrl: string; emailed: boolean; emailError?: string; ownerAlreadyMember: boolean };

/** `initial` pre-fills the form, e.g. from a community request. */
export function ProvisionForm({ initial }: { initial?: { name?: string; ownerEmail?: string } } = {}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const form = useZodForm(provisionSchema, { name: initial?.name ?? "", slug: slugify(initial?.name ?? ""), description: "", ownerEmail: initial?.ownerEmail ?? "" });
  const { register, formState } = form;
  const err = (k: keyof typeof formState.errors) => formState.errors[k]?.message;
  /** The slug follows the name until someone edits it by hand. */
  const [slugTouched, setSlugTouched] = useState(false);
  const name = form.watch("name");
  const ownerEmail = form.watch("ownerEmail");
  const [spaces, setSpaces] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);

  function addSpace(value: string) {
    const v = value.trim();
    if (!v || spaces.some((s) => s.toLowerCase() === v.toLowerCase()) || spaces.length >= 20) return;
    setSpaces((s) => [...s, v]);
    setDraft("");
  }

  const submit = form.handleSubmit((v) => {
    const pendingSpaces = draft.trim() ? [...spaces, draft.trim()] : spaces;
    start(async () => {
      const { data, error } = await api.admin.communities.post({
        name: v.name,
        slug: v.slug,
        description: v.description ?? undefined,
        ownerEmail: v.ownerEmail,
        spaces: pendingSpaces,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (error) return void toast.error(apiError(error));
      setResult(data);
      toast.success(`${v.name} is live at /c/${data.slug}`);
      router.refresh();
    });
  });

  if (result) {
    return (
      <div className="rounded-2xl bg-card shadow-card ring-1 ring-foreground/5 p-6">
        <div className="grid size-10 place-items-center rounded-xl bg-mint-soft text-mint-foreground">
          <Check className="size-5" />
        </div>
        <h2 className="mt-4 text-xl font-bold">{name} is provisioned</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Spaces: {result.spaces.map((s) => `/c/${result.slug}/${s}`).join(", ")}
        </p>
        <div className="mt-5 rounded-xl border border-dashed bg-surface p-3">
          <div className="text-xs font-medium">Community Lead invite for {ownerEmail}</div>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate font-mono text-xs">{result.ownerInviteUrl}</code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(result.ownerInviteUrl);
                setCopied(true);
              }}
            >
              {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {result.ownerAlreadyMember
              ? "They already had an account, so they're Community Lead now. "
              : ""}
            {result.emailed
              ? "We emailed them this invite."
              : `The email didn't send${result.emailError ? ` (${result.emailError})` : ""}. Send them this link yourself.`}
          </p>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <ButtonLink href={`/admin/communities/${result.slug}`}>View in Global House</ButtonLink>
          <ButtonLink href={`/c/${result.slug}`} variant="outline">
            Open portal
          </ButtonLink>
          <Button
            variant="ghost"
            onClick={() => {
              setResult(null);
              form.reset({ name: "", slug: "", description: "", ownerEmail: "" });
              setSlugTouched(false);
              setSpaces([]);
              setCopied(false);
            }}
          >
            Provision another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={submit} className="space-y-8">
      <section className="space-y-5 rounded-2xl bg-card shadow-card ring-1 ring-foreground/5 p-6">
        <h2 className="font-display text-lg font-bold">Community</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Community name</Label>
            <Input
              id="name"
              maxLength={80}
              placeholder="GDG OAU"
              {...register("name", {
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                  if (!slugTouched) form.setValue("slug", slugify(e.target.value), { shouldValidate: formState.isSubmitted });
                },
              })}
              {...invalid("name", err("name"))}
            />
            <FieldError id="name-error" message={err("name")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slug">URL slug</Label>
            <div className="flex items-center rounded-xl border border-input bg-surface pl-4 font-mono text-xs text-muted-foreground shadow-xs focus-within:border-primary focus-within:ring-4 focus-within:ring-ring/15">
              <span>/c/</span>
              <input
                id="slug"
                className="h-8 min-w-0 flex-1 bg-transparent pr-3 text-foreground outline-none"
                placeholder="gdg-oau"
                {...register("slug", {
                  setValueAs: (v: string) => v.toLowerCase(),
                  onChange: () => setSlugTouched(true),
                })}
                {...invalid("slug", err("slug"))}
              />
            </div>
            <FieldError id="slug-error" message={err("slug")} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            rows={2}
            maxLength={500}
            placeholder="Google Developer Group at Obafemi Awolowo University."
            {...register("description")}
            {...invalid("description", err("description"))}
          />
          <FieldError id="description-error" message={err("description")} />
        </div>
      </section>

      <section className="space-y-4 rounded-2xl bg-card shadow-card ring-1 ring-foreground/5 p-6">
        <div>
          <h2 className="font-display text-lg font-bold">Spaces</h2>
          <p className="text-sm text-muted-foreground">
            The tracks this community runs. Each one gets its own roadmap, team and leaderboard. Leave empty for a single
            &ldquo;General&rdquo; space.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {spaces.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 rounded-full bg-surface py-1 pr-1 pl-3.5 text-sm font-medium">
              {s}
              <span className="font-mono text-[10px] text-muted-foreground">/{slugify(s)}</span>
              <button
                type="button"
                aria-label={`Remove ${s}`}
                onClick={() => setSpaces((all) => all.filter((x) => x !== s))}
                className="grid size-5 place-items-center rounded hover:bg-muted"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Add a space, e.g. Web Development"
            value={draft}
            maxLength={60}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSpace(draft);
              }
            }}
          />
          <Button type="button" variant="outline" onClick={() => addSpace(draft)} disabled={!draft.trim()}>
            <Plus /> Add
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.filter((s) => !spaces.includes(s)).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addSpace(s)}
              className="rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-solid hover:text-foreground"
            >
              + {s}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-2xl bg-card shadow-card ring-1 ring-foreground/5 p-6">
        <div>
          <h2 className="font-display text-lg font-bold">Community Lead</h2>
          <p className="text-sm text-muted-foreground">
            The president. They see everything in the community, get Space Lead access in every space, and add or remove admins, space leads, managers and mentors. You can hand the role to someone else later.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="owner">Community Lead email</Label>
          <Input id="owner" type="email" placeholder="lead@gdg-oau.dev" {...register("ownerEmail")} {...invalid("owner", err("ownerEmail"))} />
          <FieldError id="owner-error" message={err("ownerEmail")} />
        </div>
      </section>

      <div className="flex justify-end">
        <Button type="submit" size="lg" className="h-11 px-5" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null} Provision community
        </Button>
      </div>
    </form>
  );
}
