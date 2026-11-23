import "server-only";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { AppError, getCommunityAccess, getSpaceAccess } from "@/server/auth/access";
import { global } from "@/lib/permissions";
import type { SpaceRole } from "@/lib/permissions";

/** Turn service errors into page navigation: 404 → notFound(), 403/410 → the /denied page. */
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AppError) {
      if (e.status === 404) notFound();
      if (e.status === 401) redirect("/login");
      redirect(`/denied?reason=${encodeURIComponent(e.message)}`);
    }
    throw e;
  }
}

export async function pageCommunity(communitySlug: string) {
  const user = await requireUser(`/c/${communitySlug}`);
  return guard(() => getCommunityAccess(user, communitySlug));
}

export async function pageSpace(communitySlug: string, spaceSlug: string) {
  const user = await requireUser(`/c/${communitySlug}/${spaceSlug}`);
  return guard(() => getSpaceAccess(user, communitySlug, spaceSlug));
}

/** For space pages that need a role (e.g. review, curriculum, team). Non-members are sent to the space home. */
export async function pageSpaceRole(communitySlug: string, spaceSlug: string, check: (r: SpaceRole | null) => boolean) {
  const access = await pageSpace(communitySlug, spaceSlug);
  if (!access.spaceRole) redirect(`/c/${communitySlug}/${spaceSlug}`);
  if (!check(access.spaceRole)) redirect(`/denied?reason=${encodeURIComponent("Your role in this space can't open that page.")}`);
  return access as typeof access & { spaceRole: SpaceRole };
}

export async function pageGlobalHouse() {
  const user = await requireUser("/admin");
  if (!global.canEnterHouse(user.globalRole)) notFound();
  return user;
}
