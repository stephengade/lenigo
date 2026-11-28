import "server-only";
import { notFound, redirect } from "next/navigation";
import { guard, pageSpaceRole } from "@/server/auth/guards";
import { getModuleWorkspace, moduleIdBySlug } from "@/server/services/learning";
import { buildModuleSteps, learnPath } from "@/lib/module-steps";

export type ModuleParams = Promise<{ community: string; space: string; track: string; module: string }>;
export type StepParams = Promise<{ community: string; space: string; track: string; module: string; step: string }>;

/**
 * Everything a module page needs. Access is decided by the same service calls as the API:
 * space membership (pageSpaceRole), then getModuleWorkspace (published, enrolled or staff,
 * module open on the learner's path). Slugs are only looked up inside the caller's space.
 */
export async function loadModule(params: ModuleParams) {
  const { community: c, space: s, track, module } = await params;
  const access = await pageSpaceRole(c, s, () => true);
  const w = await guard(async () => getModuleWorkspace(access, await moduleIdBySlug(access, track, module)));
  const base = `/c/${c}/${s}`;
  const steps = buildModuleSteps({
    resources: w.resources,
    checkpoints: w.checkpoints,
    submissionStatus: w.submissions[0]?.status ?? null,
    preview: w.preview,
  });
  return { c, s, base, moduleBase: learnPath(base, w.track.slug, w.module.slug), w, steps };
}

export type ModuleContext = Awaited<ReturnType<typeof loadModule>>;

/** One step page. A locked module sends the learner to its "not yet" page; an unknown step is a 404. */
export async function loadStep(params: StepParams) {
  const { step: segment } = await params;
  const ctx = await loadModule(params);
  if (ctx.w.locked) redirect(ctx.moduleBase);
  const index = ctx.steps.findIndex((st) => st.path === segment);
  if (index < 0) notFound();
  return { ...ctx, step: ctx.steps[index], index };
}

export type StepContext = Awaited<ReturnType<typeof loadStep>>;
