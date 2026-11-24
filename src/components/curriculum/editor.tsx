"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect } from "@/components/form-field";
import { spaceApi, useApiAction } from "@/components/use-api-action";
import { LEVEL_LABEL, LEVELS, type LevelTier } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type Scope = { c: string; s: string };

/* ── Tracks ───────────────────────────────────────────────────────── */

export function CreateTrackDialog({ c, s }: Scope) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { pending, run } = useApiAction();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus /> New track
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => spaceApi(c, s).tracks.post({ title, description: description || null }), {
              success: "Track created with three levels",
              onDone: (d) => {
                setOpen(false);
                router.push(`/c/${c}/${s}/curriculum/${d.id}`);
              },
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>New track</DialogTitle>
            <DialogDescription>A path learners follow from their first lesson to shipping real work, like Frontend, Backend or Data Analysis.</DialogDescription>
          </DialogHeader>
          <Field label="Name" htmlFor="track-title">
            <Input id="track-title" required minLength={2} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Frontend" />
          </Field>
          <Field label="What learners will be able to do" htmlFor="track-desc">
            <Textarea id="track-desc" rows={3} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null} Create track
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TrackSettingsForm({
  c,
  s,
  track,
  otherTracks,
}: Scope & {
  track: { id: string; title: string; description: string | null; prerequisiteTrackId: string | null; prerequisiteTier: LevelTier | null; placementTaskMd: string | null };
  otherTracks: { id: string; title: string }[];
}) {
  const { pending, run } = useApiAction();
  const [title, setTitle] = useState(track.title);
  const [description, setDescription] = useState(track.description ?? "");
  const [pre, setPre] = useState(track.prerequisiteTrackId ?? "");
  const [tier, setTier] = useState<LevelTier>(track.prerequisiteTier ?? "INTERMEDIATE");
  const [task, setTask] = useState(track.placementTaskMd ?? "");
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () =>
            spaceApi(c, s).tracks({ id: track.id }).patch({
              title,
              description: description || null,
              prerequisiteTrackId: pre || null,
              prerequisiteTier: pre ? tier : null,
              placementTaskMd: task || null,
            }),
          { success: "Track saved" },
        );
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="t-title">
          <Input id="t-title" required minLength={2} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Requires" htmlFor="t-pre" hint="Learners can only be added once they reach this level in the other track.">
          <div className="flex gap-2">
            <NativeSelect id="t-pre" value={pre} onChange={(e) => setPre(e.target.value)}>
              <option value="">Nothing, anyone can start</option>
              {otherTracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </NativeSelect>
            {pre ? (
              <NativeSelect aria-label="Level required" value={tier} onChange={(e) => setTier(e.target.value as LevelTier)} className="w-40">
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_LABEL[l]}+
                  </option>
                ))}
              </NativeSelect>
            ) : null}
          </div>
        </Field>
      </div>
      <Field label="Description" htmlFor="t-desc">
        <Textarea id="t-desc" rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field
        label="Placement test: practical task"
        htmlFor="t-task"
        hint="Leave empty to turn the placement test off. Learners who pass the quiz build this; a mentor reviews it. Markdown works."
      >
        <Textarea id="t-task" rows={5} maxLength={8000} value={task} onChange={(e) => setTask(e.target.value)} placeholder={"Build a responsive landing page from this design…\n\n- Semantic HTML\n- Works on a phone"} />
      </Field>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null} Save track
        </Button>
      </div>
    </form>
  );
}

/* ── Publish, move, delete (shared) ───────────────────────────────── */

type PublishKind = "track" | "level" | "module";

export function PublishToggle({ c, s, kind, id, published, size = "sm" }: Scope & { kind: PublishKind; id: string; published: boolean; size?: "sm" | "xs" }) {
  const { pending, run } = useApiAction();
  const body = { isPublished: !published };
  const call = () => {
    const a = spaceApi(c, s);
    if (kind === "track") return a.tracks({ id }).patch(body);
    if (kind === "level") return a.levels({ id }).patch(body);
    return a.modules({ id }).patch(body);
  };
  return (
    <Button size={size} variant={published ? "outline" : "default"} disabled={pending} onClick={() => run(call, { success: published ? "Unpublished" : "Published" })}>
      {pending ? <Loader2 className="animate-spin" /> : published ? <EyeOff /> : <Eye />}
      {published ? "Unpublish" : "Publish"}
    </Button>
  );
}

export function MoveButtons({ c, s, kind, id, first, last }: Scope & { kind: "track" | "module" | "resource"; id: string; first?: boolean; last?: boolean }) {
  const { pending, run } = useApiAction();
  const move = (direction: "up" | "down") => () => {
    const a = spaceApi(c, s);
    if (kind === "track") return a.tracks({ id }).move.post({ direction });
    if (kind === "module") return a.modules({ id }).move.post({ direction });
    return a.resources({ id }).move.post({ direction });
  };
  return (
    <span className="inline-flex">
      <Button size="icon-xs" variant="ghost" aria-label="Move up" disabled={pending || first} onClick={() => run(move("up"))}>
        <ArrowUp />
      </Button>
      <Button size="icon-xs" variant="ghost" aria-label="Move down" disabled={pending || last} onClick={() => run(move("down"))}>
        <ArrowDown />
      </Button>
    </span>
  );
}

type DeleteKind = "track" | "branch" | "module" | "resource" | "checkpoint" | "question" | "placement-question";

export function DeleteButton({ c, s, kind, id, label, redirectTo }: Scope & { kind: DeleteKind; id: string; label: string; redirectTo?: string }) {
  const router = useRouter();
  const { pending, run } = useApiAction();
  const call = () => {
    const a = spaceApi(c, s);
    switch (kind) {
      case "track":
        return a.tracks({ id }).delete();
      case "branch":
        return a.branches({ id }).delete();
      case "module":
        return a.modules({ id }).delete();
      case "resource":
        return a.resources({ id }).delete();
      case "checkpoint":
        return a.checkpoints({ id }).delete();
      case "question":
        return a.questions({ id }).delete();
      case "placement-question":
        return a["placement-questions"]({ id }).delete();
    }
  };
  return (
    <Button
      size="icon-xs"
      variant="ghost"
      aria-label={`Delete ${label}`}
      disabled={pending}
      onClick={() => {
        if (!confirm(`Delete ${label}? This can't be undone.`)) return;
        run(call, { success: "Deleted", onDone: () => (redirectTo ? router.push(redirectTo) : undefined) });
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
    </Button>
  );
}

/* ── Levels, options, modules ─────────────────────────────────────── */

export function LevelTitleForm({ c, s, levelId, title }: Scope & { levelId: string; title: string }) {
  const { pending, run } = useApiAction();
  const [value, setValue] = useState(title);
  const dirty = value.trim() !== title;
  return (
    <form
      className="flex min-w-0 flex-1 items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => spaceApi(c, s).levels({ id: levelId }).patch({ title: value }), { success: "Level renamed" });
      }}
    >
      <Input aria-label="Level name" value={value} maxLength={60} onChange={(e) => setValue(e.target.value)} className="h-9 max-w-xs font-display font-bold" />
      {dirty ? (
        <Button type="submit" size="sm" disabled={pending}>
          Save
        </Button>
      ) : null}
    </form>
  );
}

export function AddBranchForm({ c, s, levelId }: Scope & { levelId: string }) {
  const { pending, run } = useApiAction();
  const [title, setTitle] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => spaceApi(c, s).levels({ id: levelId }).branches.post({ title }), { success: "Option added", onDone: () => setTitle("") });
      }}
    >
      <Input aria-label="New option" placeholder="e.g. React + Next.js" value={title} minLength={2} maxLength={60} required onChange={(e) => setTitle(e.target.value)} className="h-9" />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        <Plus /> Option
      </Button>
    </form>
  );
}

export function AddModuleForm({ c, s, levelId, branches }: Scope & { levelId: string; branches: { id: string; title: string }[] }) {
  const router = useRouter();
  const { pending, run } = useApiAction();
  const [title, setTitle] = useState("");
  const [branchId, setBranchId] = useState("");
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => spaceApi(c, s).levels({ id: levelId }).modules.post({ title, branchId: branchId || null }), {
          success: "Module added",
          onDone: (d) => router.push(`/c/${c}/${s}/curriculum/modules/${d.id}`),
        });
      }}
    >
      <Input aria-label="New module" placeholder="New module title" value={title} minLength={2} maxLength={100} required onChange={(e) => setTitle(e.target.value)} className="h-9 min-w-48 flex-1" />
      {branches.length ? (
        <NativeSelect aria-label="Part of" value={branchId} onChange={(e) => setBranchId(e.target.value)} className="h-9 w-auto">
          <option value="">Core (everyone)</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              Only {b.title}
            </option>
          ))}
        </NativeSelect>
      ) : null}
      <Button type="submit" size="sm" disabled={pending}>
        <Plus /> Module
      </Button>
    </form>
  );
}

export function ModuleDetailsForm({
  c,
  s,
  module,
  branches,
  hasProgress,
}: Scope & {
  module: { id: string; title: string; summary: string | null; projectBriefMd: string | null; branchId: string | null };
  branches: { id: string; title: string }[];
  hasProgress: boolean;
}) {
  const { pending, run } = useApiAction();
  const [title, setTitle] = useState(module.title);
  const [summary, setSummary] = useState(module.summary ?? "");
  const [brief, setBrief] = useState(module.projectBriefMd ?? "");
  const [branchId, setBranchId] = useState(module.branchId ?? "");
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () =>
            spaceApi(c, s)
              .modules({ id: module.id })
              .patch({ title, summary: summary || null, projectBriefMd: brief || null, ...(branchId !== (module.branchId ?? "") ? { branchId: branchId || null } : {}) }),
          { success: "Module saved" },
        );
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
        <Field label="Title" htmlFor="m-title">
          <Input id="m-title" required minLength={2} maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        {branches.length ? (
          <Field label="Who takes it" htmlFor="m-branch" hint={hasProgress ? "Locked: learners have started it." : undefined}>
            <NativeSelect id="m-branch" value={branchId} disabled={hasProgress} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">Core (everyone)</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  Only {b.title}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : null}
      </div>
      <Field label="Summary" htmlFor="m-summary">
        <Textarea id="m-summary" rows={2} maxLength={500} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </Field>
      <Field label="Capstone project brief" htmlFor="m-brief" hint="Required to publish. What to build, what 'done' looks like, how it's scored. Markdown works.">
        <Textarea id="m-brief" rows={8} maxLength={10000} value={brief} onChange={(e) => setBrief(e.target.value)} className="font-mono text-xs" />
      </Field>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null} Save module
        </Button>
      </div>
    </form>
  );
}

/* ── Lessons ──────────────────────────────────────────────────────── */

export function AddResourceForm({ c, s, moduleId }: Scope & { moduleId: string }) {
  const { pending, run } = useApiAction();
  const [type, setType] = useState<"VIDEO" | "ARTICLE">("VIDEO");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [minutes, setMinutes] = useState("");
  return (
    <form
      className="grid gap-3 rounded-2xl border border-dashed border-border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => spaceApi(c, s).modules({ id: moduleId }).resources.post({ type, url, title, sourceName: sourceName || null, minutes: minutes ? Number(minutes) : null }),
          {
            success: "Lesson added",
            onDone: () => {
              setUrl("");
              setTitle("");
              setSourceName("");
              setMinutes("");
            },
          },
        );
      }}
    >
      <div className="flex gap-1 rounded-full bg-surface p-1 text-sm">
        {(
          [
            ["VIDEO", "Video lesson"],
            ["ARTICLE", "Learn-more link"],
          ] as const
        ).map(([v, l]) => (
          <button key={v} type="button" onClick={() => setType(v)} className={cn("flex-1 rounded-full px-3 py-1.5 font-medium", type === v ? "bg-ink text-ink-foreground" : "text-muted-foreground")}>
            {l}
          </button>
        ))}
      </div>
      <Field
        label="Link"
        htmlFor="r-url"
        hint={type === "VIDEO" ? "YouTube works best (watch time is tracked). Google Drive and other https links work too." : "An https article, docs page or guide. Optional reading."}
      >
        <Input id="r-url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder={type === "VIDEO" ? "https://www.youtube.com/watch?v=…" : "https://developer.mozilla.org/…"} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem_8rem]">
        <Field label="Title" htmlFor="r-title">
          <Input id="r-title" required minLength={2} maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Creator" htmlFor="r-src">
          <Input id="r-src" maxLength={80} value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="Channel or site" />
        </Field>
        <Field label={type === "VIDEO" ? "Length (min)" : "Read (min)"} htmlFor="r-min">
          <Input id="r-min" type="number" min={0} max={600} step="0.5" value={minutes} required={type === "VIDEO"} onChange={(e) => setMinutes(e.target.value)} />
        </Field>
      </div>
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus />} Add {type === "VIDEO" ? "video" : "link"}
        </Button>
      </div>
    </form>
  );
}

/* ── Checkpoints and questions ────────────────────────────────────── */

export function AddCheckpointForm({ c, s, moduleId, videos }: Scope & { moduleId: string; videos: { id: string; title: string }[] }) {
  const { pending, run } = useApiAction();
  const [title, setTitle] = useState("");
  const [after, setAfter] = useState("");
  const [threshold, setThreshold] = useState("80");
  return (
    <form
      className="grid gap-3 rounded-2xl border border-dashed border-border p-4 sm:grid-cols-[1fr_14rem_7rem_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => spaceApi(c, s).modules({ id: moduleId }).checkpoints.post({ title, afterResourceId: after || null, passThreshold: Number(threshold) }), {
          success: "Checkpoint added. Now add its questions.",
          onDone: () => setTitle(""),
        });
      }}
    >
      <Field label="Checkpoint" htmlFor="cp-title">
        <Input id="cp-title" required minLength={2} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Flexbox basics" />
      </Field>
      <Field label="Opens after" htmlFor="cp-after">
        <NativeSelect id="cp-after" value={after} onChange={(e) => setAfter(e.target.value)}>
          <option value="">Straight away</option>
          {videos.map((v) => (
            <option key={v.id} value={v.id}>
              {v.title}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Pass mark %" htmlFor="cp-th">
        <Input id="cp-th" type="number" min={50} max={100} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
      </Field>
      <Button type="submit" size="sm" disabled={pending} className="h-11">
        <Plus /> Add
      </Button>
    </form>
  );
}

export function QuestionForm({ c, s, target }: Scope & { target: { kind: "checkpoint"; id: string } | { kind: "placement"; trackId: string } }) {
  const { pending, run } = useApiAction();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [code, setCode] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correct, setCorrect] = useState(0);
  const [explanation, setExplanation] = useState("");
  if (!open)
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus /> Question
      </Button>
    );
  const reset = () => {
    setPrompt("");
    setCode("");
    setOptions(["", "", "", ""]);
    setCorrect(0);
    setExplanation("");
  };
  return (
    <form
      className="grid gap-3 rounded-2xl bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const filled = options.map((o) => o.trim());
        const kept = filled.filter(Boolean);
        const correctIndex = kept.indexOf(filled[correct]);
        const body = { prompt, codeSnippet: code || null, options: kept, correctOptionIndex: Math.max(0, correctIndex), explanation: explanation || null };
        run(
          () => (target.kind === "checkpoint" ? spaceApi(c, s).checkpoints({ id: target.id }).questions.post(body) : spaceApi(c, s).tracks({ id: target.trackId })["placement-questions"].post(body)),
          { success: "Question added", onDone: reset },
        );
      }}
    >
      <Field label="Question" htmlFor="q-prompt">
        <Textarea id="q-prompt" rows={2} required maxLength={1000} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </Field>
      <Field label="Code (optional)" htmlFor="q-code">
        <Textarea id="q-code" rows={3} maxLength={4000} value={code} onChange={(e) => setCode(e.target.value)} className="font-mono text-xs" />
      </Field>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Answers (select the correct one)</legend>
        {options.map((o, i) => (
          <label key={i} className="flex items-center gap-2">
            <input type="radio" name="correct" checked={correct === i} onChange={() => setCorrect(i)} className="size-4 accent-[var(--color-mint)]" />
            <Input
              aria-label={`Answer ${i + 1}`}
              value={o}
              maxLength={300}
              required={i < 2}
              onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
              className="h-9"
              placeholder={i < 2 ? "Required" : "Optional"}
            />
          </label>
        ))}
      </fieldset>
      {target.kind === "checkpoint" ? (
        <Field label="Why it's right (shown after a pass)" htmlFor="q-exp">
          <Textarea id="q-exp" rows={2} maxLength={1000} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
        </Field>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || !options[correct]?.trim()}>
          {pending ? <Loader2 className="animate-spin" /> : null} Save question
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Done
        </Button>
      </div>
    </form>
  );
}
