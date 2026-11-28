import { trackingFor, type VideoProvider } from "@/lib/video";

/**
 * A module as a sequence of pages, like a course player: each video lesson, then the checkpoints
 * placed after it, then any loose checkpoints, then the capstone project. A step opens once every
 * step before it is done. This is navigation only: the server still enforces the real rules
 * (watch time, a checkpoint's lesson, a project's prerequisites).
 */

export type StepKind = "lesson" | "quiz" | "project";

export type ModuleStep = {
  kind: StepKind;
  /** Resource id for a lesson, checkpoint id for a quiz, "project" for the capstone. */
  id: string;
  title: string;
  /** The step's URL segment below the module: a lesson or quiz slug, or "project". */
  path: string;
  done: boolean;
  open: boolean;
  /** Videos that play outside Lenigo can't be tracked, so they never block. */
  tracked: boolean;
};

type Video = { id: string; slug: string; title: string; type: string; provider: VideoProvider | null; completed: boolean };
type Checkpoint = { id: string; slug: string; title: string; afterResourceId: string | null; passed: boolean };

export function buildModuleSteps(input: {
  resources: Video[];
  checkpoints: Checkpoint[];
  submissionStatus: string | null;
  /** Staff preview: every step is open. */
  preview: boolean;
}): ModuleStep[] {
  const videos = input.resources.filter((r) => r.type === "VIDEO");
  const placed = new Set<string>();
  const raw: Omit<ModuleStep, "open">[] = [];

  for (const v of videos) {
    const tracked = trackingFor(v.provider ?? "EXTERNAL") !== "none";
    raw.push({ kind: "lesson", id: v.id, title: v.title, path: v.slug, done: !tracked || v.completed, tracked });
    for (const cp of input.checkpoints.filter((c) => c.afterResourceId === v.id)) {
      placed.add(cp.id);
      raw.push({ kind: "quiz", id: cp.id, title: cp.title, path: cp.slug, done: cp.passed, tracked: true });
    }
  }
  for (const cp of input.checkpoints.filter((c) => !placed.has(c.id))) {
    raw.push({ kind: "quiz", id: cp.id, title: cp.title, path: cp.slug, done: cp.passed, tracked: true });
  }
  raw.push({ kind: "project", id: "project", title: "Capstone project", path: "project", done: input.submissionStatus === "APPROVED", tracked: true });

  let allBefore = true;
  return raw.map((st) => {
    const open = input.preview || allBefore;
    allBefore &&= st.done;
    return { ...st, open };
  });
}

/** Where a learner should land when they open the module: the first open step that isn't done. */
export function resumeStep(steps: ModuleStep[]): ModuleStep {
  return steps.find((st) => st.open && !st.done) ?? steps[steps.length - 1];
}

/** Every learner-facing curriculum URL goes through here: /c/<c>/<s>/learn/<track>/<module>[/<step>]. */
export function learnPath(spaceBase: string, trackSlug: string, moduleSlug: string, step?: string) {
  return `${spaceBase}/learn/${trackSlug}/${moduleSlug}${step ? `/${step}` : ""}`;
}
