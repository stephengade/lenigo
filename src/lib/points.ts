/**
 * What earns points, as shown to learners. Deliberately has NO numbers:
 * the weights live in server/points/rules.ts (server-only) and never reach the browser,
 * so nobody can work out the cheapest way to climb the leaderboard.
 */
export type PointSourceKey = "project" | "checkpoint" | "review" | "standup" | "video" | "streak" | "workshop";

/** Listed in the order a learner meets them, NOT by value: the order must not hint at weights. */
export const POINT_SOURCES: { key: PointSourceKey; label: string; hint: string }[] = [
  { key: "video", label: "Lessons", hint: "Watching lessons all the way through." },
  { key: "checkpoint", label: "Checkpoint assessments", hint: "Passing each checkpoint in a module." },
  { key: "project", label: "Capstone projects", hint: "Approved and scored by a mentor. Quality counts." },
  { key: "standup", label: "Daily standups", hint: "Posting what you did and what's next." },
  { key: "review", label: "Standup reviews", hint: "Attending a live review and presenting your progress." },
  { key: "workshop", label: "Workshops", hint: "Attending community workshops." },
  { key: "streak", label: "Consistency", hint: "Showing up day after day." },
];
