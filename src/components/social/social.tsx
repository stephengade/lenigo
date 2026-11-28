"use client";

import { Loader2, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldError, invalid, NativeSelect } from "@/components/form-field";
import { useZodForm } from "@/components/use-zod-form";
import { commentSchema, standupSchema } from "@/lib/schemas";
import { spaceApi, useApiAction } from "@/components/use-api-action";
import { cn } from "@/lib/utils";

type Scope = { c: string; s: string };

export function StandupForm({ c, s, modules }: Scope & { modules: { id: string; title: string }[] }) {
  const { pending, run } = useApiAction();
  const form = useZodForm(standupSchema, { didToday: "", nextStep: "", blockers: "", moduleId: modules[0]?.id ?? "" });
  const err = (k: "didToday" | "nextStep" | "blockers") => form.formState.errors[k]?.message;
  return (
    <form
      noValidate
      className="grid gap-3"
      onSubmit={form.handleSubmit((v) =>
        run(() => spaceApi(c, s).standups.post(v), {
          success: (d) => (d.milestone ? `${d.milestone}-day streak! Keep it going.` : `Posted. Streak: ${d.streak} day${d.streak === 1 ? "" : "s"}.`),
          onDone: () => form.reset({ didToday: "", nextStep: "", blockers: "", moduleId: v.moduleId ?? "" }),
        }),
      )}
    >
      <Field label="What did you build or learn today?" htmlFor="su-did" error={err("didToday")}>
        <Textarea id="su-did" rows={3} maxLength={1500} {...form.register("didToday")} {...invalid("su-did", err("didToday"))} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Next step" htmlFor="su-next" error={err("nextStep")}>
          <Input id="su-next" maxLength={600} {...form.register("nextStep")} {...invalid("su-next", err("nextStep"))} />
        </Field>
        <Field label="Anything blocking you?" htmlFor="su-block" hint="Mentors watch for these." error={err("blockers")}>
          <Input id="su-block" maxLength={600} placeholder="Optional" {...form.register("blockers")} {...invalid("su-block", err("blockers"))} />
        </Field>
      </div>
      {modules.length ? (
        <Field label="Working on" htmlFor="su-mod" className="max-w-sm">
          <NativeSelect id="su-mod" {...form.register("moduleId")}>
            <option value="">Something else</option>
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Send />} Post standup
        </Button>
      </div>
    </form>
  );
}

export function Reactions({ c, s, itemId, reactions }: Scope & { itemId: string; reactions: { emoji: string; count: number; mine: boolean }[] }) {
  const { pending, run } = useApiAction();
  return (
    <div className="flex flex-wrap gap-1.5">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          disabled={pending}
          aria-pressed={r.mine}
          aria-label={`React ${r.emoji}`}
          onClick={() => run(() => spaceApi(c, s).feed({ id: itemId }).reactions.post({ emoji: r.emoji }))}
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-sm transition-colors",
            r.mine ? "bg-secondary ring-1 ring-primary/40" : "bg-surface hover:bg-accent",
            !r.count && !r.mine && "opacity-60 hover:opacity-100",
          )}
        >
          <span>{r.emoji}</span>
          {r.count ? <span className="text-xs font-medium tabular">{r.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function CommentForm({ c, s, itemId }: Scope & { itemId: string }) {
  const { pending, run } = useApiAction();
  const form = useZodForm(commentSchema, { body: "" });
  const error = form.formState.errors.body?.message;
  const body = form.watch("body");
  return (
    <form
      noValidate
      className="grid gap-1"
      onSubmit={form.handleSubmit((v) => run(() => spaceApi(c, s).feed({ id: itemId }).comments.post(v), { onDone: () => form.reset({ body: "" }) }))}
    >
      <div className="flex gap-2">
        <Input aria-label="Write a comment" placeholder="Cheer them on or help out…" maxLength={1000} className="h-9" {...form.register("body")} {...invalid(`cm-${itemId}`, error)} />
        <Button type="submit" size="sm" variant="outline" disabled={pending || !body.trim()}>
          {pending ? <Loader2 className="animate-spin" /> : "Reply"}
        </Button>
      </div>
      <FieldError id={`cm-${itemId}-error`} message={error} />
    </form>
  );
}

export function DeleteCommentButton({ c, s, commentId }: Scope & { commentId: string }) {
  const { pending, run } = useApiAction();
  return (
    <button
      type="button"
      aria-label="Delete comment"
      disabled={pending}
      onClick={() => confirm("Delete this comment?") && run(() => spaceApi(c, s).comments({ id: commentId }).delete())}
      className="text-muted-foreground hover:text-destructive"
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}
