"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldError, invalid, NativeSelect } from "@/components/form-field";
import { useZodForm } from "@/components/use-zod-form";
import { addModuleSchema, checkpointSchema, moduleSchema, nameSchema, questionSchema, resourceSchema, trackSchema, trackSettingsSchema } from "@/lib/schemas";
import { parseDriveId, parseYouTubeId } from "@/lib/video";
import { spaceApi, useApiAction } from "@/components/use-api-action";
import { LEVEL_LABEL, LEVELS, type LevelTier } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type Scope = { c: string; s: string };

/* ── Tracks ───────────────────────────────────────────────────────── */

export function CreateTrackDialog({ c, s }: Scope) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { pending, run } = useApiAction();
  const form = useZodForm(trackSchema, { title: "", description: "" });
  const err = (k: "title" | "description") => form.formState.errors[k]?.message;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus /> New track
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form
          noValidate
          className="space-y-5"
          onSubmit={form.handleSubmit((v) =>
            run(() => spaceApi(c, s).tracks.post(v), {
              success: "Track created with three levels",
              onDone: (d) => {
                setOpen(false);
                router.push(`/c/${c}/${s}/curriculum/${d.id}`);
              },
            }),
          )}
        >
          <DialogHeader>
            <DialogTitle>New track</DialogTitle>
            <DialogDescription>A path learners follow from their first lesson to shipping real work, like Frontend, Backend or Data Analysis.</DialogDescription>
          </DialogHeader>
          <Field label="Name" htmlFor="track-title" error={err("title")}>
            <Input id="track-title" maxLength={80} placeholder="Frontend" {...form.register("title")} {...invalid("track-title", err("title"))} />
          </Field>
          <Field label="What learners will be able to do" htmlFor="track-desc" error={err("description")}>
            <Textarea id="track-desc" rows={3} maxLength={500} {...form.register("description")} {...invalid("track-desc", err("description"))} />
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
  const form = useZodForm(trackSettingsSchema, {
    title: track.title,
    description: track.description ?? "",
    prerequisiteTrackId: track.prerequisiteTrackId ?? "",
    prerequisiteTier: track.prerequisiteTier ?? "INTERMEDIATE",
    placementTaskMd: track.placementTaskMd ?? "",
  });
  const err = (k: "title" | "description" | "placementTaskMd") => form.formState.errors[k]?.message;
  const pre = form.watch("prerequisiteTrackId");
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={form.handleSubmit((v) =>
        run(
          () =>
            spaceApi(c, s).tracks({ id: track.id }).patch({
              title: v.title,
              description: v.description,
              prerequisiteTrackId: v.prerequisiteTrackId || null,
              prerequisiteTier: v.prerequisiteTrackId ? (v.prerequisiteTier as LevelTier) : null,
              placementTaskMd: v.placementTaskMd,
            }),
          { success: "Track saved" },
        ),
      )}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="t-title" error={err("title")}>
          <Input id="t-title" maxLength={80} {...form.register("title")} {...invalid("t-title", err("title"))} />
        </Field>
        <Field label="Requires" htmlFor="t-pre" hint="Learners can only be added once they reach this level in the other track.">
          <div className="flex gap-2">
            <NativeSelect id="t-pre" {...form.register("prerequisiteTrackId")}>
              <option value="">Nothing, anyone can start</option>
              {otherTracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </NativeSelect>
            {pre ? (
              <NativeSelect aria-label="Level required" className="w-40" {...form.register("prerequisiteTier")}>
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
      <Field label="Description" htmlFor="t-desc" error={err("description")}>
        <Textarea id="t-desc" rows={2} maxLength={500} {...form.register("description")} {...invalid("t-desc", err("description"))} />
      </Field>
      <Field
        label="Placement test: practical task"
        htmlFor="t-task"
        hint="Leave empty to turn the placement test off. Learners who pass the quiz build this; a mentor reviews it. Markdown works."
        error={err("placementTaskMd")}
      >
        <Textarea
          id="t-task"
          rows={5}
          maxLength={8000}
          placeholder={"Build a responsive landing page from this design…\n\n- Semantic HTML\n- Works on a phone"}
          {...form.register("placementTaskMd")}
          {...invalid("t-task", err("placementTaskMd"))}
        />
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
  const form = useZodForm(nameSchema("the level's name", 60), { title });
  const value = form.watch("title");
  const error = form.formState.errors.title?.message;
  const dirty = value.trim() !== title;
  return (
    <form
      noValidate
      className="grid min-w-0 flex-1 gap-1"
      onSubmit={form.handleSubmit((v) => run(() => spaceApi(c, s).levels({ id: levelId }).patch(v), { success: "Level renamed" }))}
    >
      <div className="flex items-center gap-2">
        <Input aria-label="Level name" maxLength={60} className="h-9 max-w-xs font-display font-bold" {...form.register("title")} {...invalid(`lv-${levelId}`, error)} />
        {dirty ? (
          <Button type="submit" size="sm" disabled={pending}>
            Save
          </Button>
        ) : null}
      </div>
      <FieldError id={`lv-${levelId}-error`} message={error} />
    </form>
  );
}

export function AddBranchForm({ c, s, levelId }: Scope & { levelId: string }) {
  const { pending, run } = useApiAction();
  const form = useZodForm(nameSchema("the option's name", 60), { title: "" });
  const error = form.formState.errors.title?.message;
  return (
    <form
      noValidate
      className="grid gap-1"
      onSubmit={form.handleSubmit((v) => run(() => spaceApi(c, s).levels({ id: levelId }).branches.post(v), { success: "Option added", onDone: () => form.reset({ title: "" }) }))}
    >
      <div className="flex gap-2">
        <Input aria-label="New option" placeholder="e.g. React + Next.js" maxLength={60} className="h-9" {...form.register("title")} {...invalid(`br-${levelId}`, error)} />
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          <Plus /> Option
        </Button>
      </div>
      <FieldError id={`br-${levelId}-error`} message={error} />
    </form>
  );
}

export function AddModuleForm({ c, s, levelId, branches }: Scope & { levelId: string; branches: { id: string; title: string }[] }) {
  const router = useRouter();
  const { pending, run } = useApiAction();
  const form = useZodForm(addModuleSchema, { title: "", branchId: "" });
  const error = form.formState.errors.title?.message;
  return (
    <form
      noValidate
      className="grid gap-1"
      onSubmit={form.handleSubmit((v) =>
        run(() => spaceApi(c, s).levels({ id: levelId }).modules.post(v), {
          success: "Module added",
          onDone: (d) => router.push(`/c/${c}/${s}/curriculum/modules/${d.id}`),
        }),
      )}
    >
      <div className="flex flex-wrap gap-2">
        <Input aria-label="New module" placeholder="New module title" maxLength={100} className="h-9 min-w-48 flex-1" {...form.register("title")} {...invalid(`md-${levelId}`, error)} />
        {branches.length ? (
          <NativeSelect aria-label="Part of" className="h-9 w-auto" {...form.register("branchId")}>
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
      </div>
      <FieldError id={`md-${levelId}-error`} message={error} />
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
  const form = useZodForm(moduleSchema, { title: module.title, summary: module.summary ?? "", projectBriefMd: module.projectBriefMd ?? "", branchId: module.branchId ?? "" });
  const err = (k: "title" | "summary" | "projectBriefMd") => form.formState.errors[k]?.message;
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={form.handleSubmit((v) =>
        run(
          () =>
            spaceApi(c, s)
              .modules({ id: module.id })
              // The option is only sent when it changed (moving a module with progress is refused).
              .patch({ title: v.title, summary: v.summary, projectBriefMd: v.projectBriefMd, ...(v.branchId !== module.branchId ? { branchId: v.branchId } : {}) }),
          { success: "Module saved" },
        ),
      )}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
        <Field label="Title" htmlFor="m-title" error={err("title")}>
          <Input id="m-title" maxLength={100} {...form.register("title")} {...invalid("m-title", err("title"))} />
        </Field>
        {branches.length ? (
          <Field label="Who takes it" htmlFor="m-branch" hint={hasProgress ? "Locked: learners have started it." : undefined}>
            <NativeSelect id="m-branch" disabled={hasProgress} {...form.register("branchId")}>
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
      <Field label="Summary" htmlFor="m-summary" error={err("summary")}>
        <Textarea id="m-summary" rows={2} maxLength={500} {...form.register("summary")} {...invalid("m-summary", err("summary"))} />
      </Field>
      <Field label="Capstone project brief" htmlFor="m-brief" hint="Required to publish. What to build, what 'done' looks like, how it's scored. Markdown works." error={err("projectBriefMd")}>
        <Textarea id="m-brief" rows={8} maxLength={10000} className="font-mono text-xs" {...form.register("projectBriefMd")} {...invalid("m-brief", err("projectBriefMd"))} />
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

/** A YouTube or Drive id is enough for a video lesson (the server rebuilds the link from it). */
const isVideoSource = (url: string) => !!(parseYouTubeId(url) || parseDriveId(url));
const lessonSchema = resourceSchema(isVideoSource);

export function AddResourceForm({ c, s, moduleId }: Scope & { moduleId: string }) {
  const { pending, run } = useApiAction();
  const form = useZodForm(lessonSchema, { type: "VIDEO", url: "", title: "", sourceName: "", minutes: "" });
  const err = (k: "url" | "title" | "sourceName" | "minutes") => form.formState.errors[k]?.message;
  const type = form.watch("type");
  return (
    <form
      noValidate
      className="grid gap-3 rounded-2xl border border-dashed border-border p-4"
      onSubmit={form.handleSubmit((v) =>
        run(() => spaceApi(c, s).modules({ id: moduleId }).resources.post(v), {
          success: "Lesson added",
          onDone: () => form.reset({ type: v.type, url: "", title: "", sourceName: "", minutes: "" }),
        }),
      )}
    >
      <div className="flex gap-1 rounded-control bg-surface p-1 text-sm">
        {(
          [
            ["VIDEO", "Video lesson"],
            ["ARTICLE", "Learn-more link"],
          ] as const
        ).map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={() => form.setValue("type", v, { shouldValidate: form.formState.isSubmitted })}
            className={cn("flex-1 rounded-[calc(var(--radius-control)-4px)] px-3 py-1.5 font-medium", type === v ? "bg-ink text-ink-foreground" : "text-muted-foreground")}
          >
            {l}
          </button>
        ))}
      </div>
      <Field
        label="Link"
        htmlFor="r-url"
        hint={type === "VIDEO" ? "YouTube or Google Drive. Learners must watch it before they can move on. Put other links in as articles." : "An https article, docs page or guide. Optional reading."}
        error={err("url")}
      >
        <Input id="r-url" placeholder={type === "VIDEO" ? "https://www.youtube.com/watch?v=…" : "https://developer.mozilla.org/…"} {...form.register("url")} {...invalid("r-url", err("url"))} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem_8rem]">
        <Field label="Title" htmlFor="r-title" error={err("title")}>
          <Input id="r-title" maxLength={160} {...form.register("title")} {...invalid("r-title", err("title"))} />
        </Field>
        <Field label="Creator" htmlFor="r-src" error={err("sourceName")}>
          <Input id="r-src" maxLength={80} placeholder="Channel or site" {...form.register("sourceName")} {...invalid("r-src", err("sourceName"))} />
        </Field>
        <Field label={type === "VIDEO" ? "Length (min)" : "Read (min)"} htmlFor="r-min" error={err("minutes")}>
          <Input id="r-min" type="number" min={0} max={600} step="0.5" {...form.register("minutes")} {...invalid("r-min", err("minutes"))} />
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
  const form = useZodForm(checkpointSchema, { title: "", afterResourceId: "", passThreshold: "80" });
  const err = (k: "title" | "passThreshold") => form.formState.errors[k]?.message;
  return (
    <form
      noValidate
      className="grid gap-3 rounded-2xl border border-dashed border-border p-4 sm:grid-cols-[1fr_14rem_7rem_auto] sm:items-start"
      onSubmit={form.handleSubmit((v) =>
        run(() => spaceApi(c, s).modules({ id: moduleId }).checkpoints.post(v), {
          success: "Checkpoint added. Now add its questions.",
          onDone: () => form.reset({ title: "", afterResourceId: v.afterResourceId ?? "", passThreshold: String(v.passThreshold) }),
        }),
      )}
    >
      <Field label="Checkpoint" htmlFor="cp-title" error={err("title")}>
        <Input id="cp-title" maxLength={120} placeholder="Flexbox basics" {...form.register("title")} {...invalid("cp-title", err("title"))} />
      </Field>
      <Field label="Opens after" htmlFor="cp-after">
        <NativeSelect id="cp-after" {...form.register("afterResourceId")}>
          <option value="">Straight away</option>
          {videos.map((v) => (
            <option key={v.id} value={v.id}>
              {v.title}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Pass mark %" htmlFor="cp-th" error={err("passThreshold")}>
        <Input id="cp-th" type="number" min={50} max={100} {...form.register("passThreshold")} {...invalid("cp-th", err("passThreshold"))} />
      </Field>
      <Button type="submit" size="sm" disabled={pending} className="h-11 sm:mt-6">
        <Plus /> Add
      </Button>
    </form>
  );
}

const EMPTY_QUESTION = { prompt: "", codeSnippet: "", options: ["", "", "", ""], correct: 0, explanation: "" };

export function QuestionForm({ c, s, target }: Scope & { target: { kind: "checkpoint"; id: string } | { kind: "placement"; trackId: string } }) {
  const { pending, run } = useApiAction();
  const [open, setOpen] = useState(false);
  const form = useZodForm(questionSchema, EMPTY_QUESTION);
  const correct = form.watch("correct");
  const promptError = form.formState.errors.prompt?.message;
  const optionsError = form.formState.errors.options?.message ?? form.formState.errors.options?.root?.message;
  if (!open)
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus /> Question
      </Button>
    );
  return (
    <form
      noValidate
      className="grid gap-3 rounded-2xl bg-surface p-4"
      onSubmit={form.handleSubmit((body) =>
        run(
          () => (target.kind === "checkpoint" ? spaceApi(c, s).checkpoints({ id: target.id }).questions.post(body) : spaceApi(c, s).tracks({ id: target.trackId })["placement-questions"].post(body)),
          { success: "Question added", onDone: () => form.reset(EMPTY_QUESTION) },
        ),
      )}
    >
      <Field label="Question" htmlFor="q-prompt" error={promptError}>
        <Textarea id="q-prompt" rows={2} maxLength={1000} {...form.register("prompt")} {...invalid("q-prompt", promptError)} />
      </Field>
      <Field label="Code (optional)" htmlFor="q-code" error={form.formState.errors.codeSnippet?.message}>
        <Textarea id="q-code" rows={3} maxLength={4000} className="font-mono text-xs" {...form.register("codeSnippet")} />
      </Field>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Answers (select the correct one)</legend>
        {[0, 1, 2, 3].map((i) => (
          <label key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name="correct"
              checked={correct === i}
              onChange={() => form.setValue("correct", i, { shouldValidate: form.formState.isSubmitted })}
              className="size-4 accent-[var(--color-mint)]"
            />
            <Input aria-label={`Answer ${i + 1}`} maxLength={300} className="h-9" placeholder={i < 2 ? "Required" : "Optional"} {...form.register(`options.${i}`)} />
          </label>
        ))}
        <FieldError message={optionsError} />
      </fieldset>
      {target.kind === "checkpoint" ? (
        <Field label="Why it's right (shown after a pass)" htmlFor="q-exp" error={form.formState.errors.explanation?.message}>
          <Textarea id="q-exp" rows={2} maxLength={1000} {...form.register("explanation")} />
        </Field>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null} Save question
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Done
        </Button>
      </div>
    </form>
  );
}
