import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { levels, trackEnrollments, tracks, users, type User } from "@/server/db/schema";
import { fail } from "@/server/auth/access";
import { logActivity } from "@/server/activity";
import { approvedProjects } from "@/server/services/learning";

const USERNAME = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;
const RESERVED = new Set(["admin", "api", "me", "settings", "login", "lenigo", "support", "help", "u", "c"]);

/**
 * A public profile (/u/[username]) is visible without signing in, so it shows only what a
 * learner would want public: name, bio, GitHub, levels per track and approved projects
 * (links they chose to submit). No email, no community names, no scores, no points.
 */
export async function getPublicProfile(username: string) {
  const [user] = await db
    .select({ id: users.id, name: users.name, username: users.username, avatarUrl: users.avatarUrl, bio: users.bio, githubUsername: users.githubUsername, createdAt: users.createdAt })
    .from(users)
    .where(sql`lower(${users.username}) = ${username.toLowerCase()}`)
    .limit(1);
  if (!user) return null;
  const [levelRows, projects] = await Promise.all([
    db
      .select({ track: tracks.title, level: levels.title, tier: trackEnrollments.tier })
      .from(trackEnrollments)
      .innerJoin(tracks, eq(tracks.id, trackEnrollments.trackId))
      .leftJoin(levels, and(eq(levels.trackId, trackEnrollments.trackId), eq(levels.tier, trackEnrollments.tier)))
      .where(and(eq(trackEnrollments.userId, user.id), eq(tracks.isPublished, true))),
    approvedProjects(user.id),
  ]);
  return { user, levels: levelRows, projects: projects.map(({ id, module, summary, track, repoUrl, liveUrl, reviewedAt }) => ({ id, module, summary, track, repoUrl, liveUrl, reviewedAt })) };
}

export async function updateProfile(
  actor: User,
  input: { name?: string; username?: string; bio?: string | null; emailNotifications?: boolean },
) {
  const set: Partial<typeof users.$inferInsert> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length < 2 || name.length > 60) throw fail.badRequest("Your name should be 2–60 characters.");
    set.name = name;
  }
  if (input.username !== undefined) {
    const username = input.username.trim().toLowerCase();
    if (!USERNAME.test(username)) throw fail.badRequest("Usernames are 3–30 lowercase letters, numbers or hyphens.");
    if (RESERVED.has(username)) throw fail.badRequest("That username is reserved.");
    const [taken] = await db.select({ id: users.id }).from(users).where(and(sql`lower(${users.username}) = ${username}`, ne(users.id, actor.id))).limit(1);
    if (taken) throw fail.conflict("That username is taken.");
    set.username = username;
  }
  if (input.bio !== undefined) {
    const bio = input.bio?.trim() || null;
    if (bio && bio.length > 280) throw fail.badRequest("Keep your bio under 280 characters.");
    set.bio = bio;
  }
  if (input.emailNotifications !== undefined) set.emailNotifications = input.emailNotifications;
  if (!Object.keys(set).length) return actor;
  const [row] = await db.update(users).set(set).where(eq(users.id, actor.id)).returning();
  await logActivity({ actorUserId: actor.id, actionType: "PROFILE_UPDATED", entityType: "user", entityId: actor.id, metadata: { fields: Object.keys(set) } });
  return row;
}
