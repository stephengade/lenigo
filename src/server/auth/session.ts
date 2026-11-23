import "server-only";
import { cache } from "react";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { User as AuthUser } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { db } from "@/server/db";
import { users, type User } from "@/server/db/schema";
import { env } from "@/server/env";
import { logActivity } from "@/server/activity";
import { slugify } from "@/lib/utils";

/**
 * Upsert the app's user row from a Supabase Auth user. Runs after every sign-in.
 * Promotes SUPER_ADMIN_EMAILS to SUPER_ADMIN (never demotes).
 */
export async function syncUserFromAuth(authUser: AuthUser, opts: { logLogin?: boolean } = {}) {
  const email = authUser.email?.toLowerCase();
  if (!email) throw new Error("Signed-in account has no email address.");

  const meta = authUser.user_metadata ?? {};
  const isGithub = authUser.app_metadata?.provider === "github" || authUser.identities?.some((i) => i.provider === "github");
  const githubUsername: string | null = isGithub ? (meta.user_name ?? meta.preferred_username ?? null) : null;
  const name: string | null = meta.full_name ?? meta.name ?? null;
  const avatarUrl: string | null = meta.avatar_url ?? meta.picture ?? null;
  const promote = env.SUPER_ADMIN_EMAILS.includes(email);

  const [existing] = await db.select().from(users).where(eq(users.id, authUser.id)).limit(1);

  let row: User;
  if (existing) {
    [row] = await db
      .update(users)
      .set({
        email,
        name: existing.name ?? name,
        avatarUrl: avatarUrl ?? existing.avatarUrl,
        githubUsername: githubUsername ?? existing.githubUsername,
        lastSeenAt: new Date(),
        ...(promote && existing.globalRole !== "SUPER_ADMIN" ? { globalRole: "SUPER_ADMIN" as const } : {}),
      })
      .where(eq(users.id, authUser.id))
      .returning();
  } else {
    [row] = await db
      .insert(users)
      .values({
        id: authUser.id,
        email,
        name,
        avatarUrl,
        githubUsername,
        username: await uniqueUsername(githubUsername ?? email.split("@")[0]),
        globalRole: promote ? "SUPER_ADMIN" : "USER",
        lastSeenAt: new Date(),
      })
      .returning();
  }

  if (opts.logLogin) {
    await logActivity({
      actorUserId: row.id,
      actionType: "LOGIN",
      entityType: "user",
      entityId: row.id,
      metadata: { provider: authUser.app_metadata?.provider ?? "email" },
    });
  }
  return row;
}

async function uniqueUsername(seed: string) {
  const base = slugify(seed).slice(0, 24) || "learner";
  for (let i = 0; i < 5; i++) {
    const candidate = i === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.username}) = ${candidate}`)
      .limit(1);
    if (!taken) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

/** The signed-in user's app row, or null. Cached for the duration of one request. */
export const getSessionUser = cache(async (): Promise<User | null> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (row) return row;

  // Signed in with Supabase but no app row yet (e.g. the callback failed half-way): repair it.
  const { data: authData } = await supabase.auth.getUser();
  return authData.user ? syncUserFromAuth(authData.user) : null;
});

export async function requireUser(next?: string) {
  const user = await getSessionUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return user;
}
