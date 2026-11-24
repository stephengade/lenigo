"use client";

import { useState } from "react";
import { Loader2, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect } from "@/components/form-field";
import { spaceApi, useApiAction } from "@/components/use-api-action";
import { cn } from "@/lib/utils";

type Scope = { c: string; s: string };

export function StandupForm({ c, s, modules }: Scope & { modules: { id: string; title: string }[] }) {
  const { pending, run } = useApiAction();
  const [didToday, setDid] = useState("");
  const [nextStep, setNext] = useState("");
  const [blockers, setBlockers] = useState("");
  const [moduleId, setModule] = useState(modules[0]?.id ?? "");
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => spaceApi(c, s).standups.post({ didToday, nextStep, blockers: blockers || null, moduleId: moduleId || null }), {
          success: (d) => (d.milestone ? `${d.milestone}-day streak! Keep it going.` : `Posted. Streak: ${d.streak} day${d.streak === 1 ? "" : "s"}.`),
        });
      }}
    >
      <Field label="What did you build or learn today?" htmlFor="su-did">
        <Textarea id="su-did" rows={3} required minLength={10} maxLength={1500} value={didToday} onChange={(e) => setDid(e.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Next step" htmlFor="su-next">
          <Input id="su-next" required minLength={5} maxLength={600} value={nextStep} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Anything blocking you?" htmlFor="su-block" hint="Mentors watch for these.">
          <Input id="su-block" maxLength={600} value={blockers} onChange={(e) => setBlockers(e.target.value)} placeholder="Optional" />
        </Field>
      </div>
      {modules.length ? (
        <Field label="Working on" htmlFor="su-mod" className="max-w-sm">
          <NativeSelect id="su-mod" value={moduleId} onChange={(e) => setModule(e.target.value)}>
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
  const [body, setBody] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => spaceApi(c, s).feed({ id: itemId }).comments.post({ body }), { onDone: () => setBody("") });
      }}
    >
      <Input aria-label="Write a comment" placeholder="Cheer them on or help out…" value={body} maxLength={1000} onChange={(e) => setBody(e.target.value)} className="h-9" />
      <Button type="submit" size="sm" variant="outline" disabled={pending || !body.trim()}>
        {pending ? <Loader2 className="animate-spin" /> : "Reply"}
      </Button>
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
