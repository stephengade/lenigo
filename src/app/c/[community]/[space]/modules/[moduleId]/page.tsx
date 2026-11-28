import { redirect } from "next/navigation";
import { guard, pageSpaceRole } from "@/server/auth/guards";
import { getModuleWorkspace } from "@/server/services/learning";
import { learnPath } from "@/lib/module-steps";

export const metadata = { title: "Module" };

/**
 * Old module links (/modules/<id>, e.g. in emails already sent) move to /learn/<track>/<module>.
 * The workspace check runs first, so the redirect never reveals a module's name to someone who
 * can't open it.
 */
export default async function LegacyModulePage({ params }: { params: Promise<{ community: string; space: string; moduleId: string }> }) {
  const { community: c, space: s, moduleId } = await params;
  const access = await pageSpaceRole(c, s, () => true);
  const w = await guard(() => getModuleWorkspace(access, moduleId));
  redirect(learnPath(`/c/${c}/${s}`, w.track.slug, w.module.slug));
}
