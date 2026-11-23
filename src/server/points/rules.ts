import "server-only";
import { db, type Tx } from "@/server/db";
import { pointsLedger, type PointsReason } from "@/server/db/schema";

/**
 * Point weights. SERVER-ONLY: never import this from a client component, never return
 * these numbers (or per-event deltas) from the API to members. Learners see the
 * categories in lib/points.ts and their total, not what each action is worth.
 *
 * Projects dominate on purpose: the mentor's score (0–100) scales the award, so a
 * rushed project earns less than a strong one, and nothing else can outrun real work.
 */
const BASE: Record<Exclude<PointsReason, "ADJUSTMENT">, number> = {
  PROJECT_APPROVED: 100, // × mentor score / 100
  CHECKPOINT_PASSED: 20,
  REVIEW_SESSION_ATTENDED: 15,
  STANDUP: 5,
  VIDEO_COMPLETED: 2,
  STREAK_BONUS: 10,
  WORKSHOP_ATTENDED: 10,
};

export function pointsFor(reason: Exclude<PointsReason, "ADJUSTMENT">, opts?: { score?: number | null }) {
  if (reason === "PROJECT_APPROVED") {
    const score = Math.max(0, Math.min(100, opts?.score ?? 0));
    return Math.round((BASE.PROJECT_APPROVED * score) / 100);
  }
  return BASE[reason];
}

/**
 * The single way to award points. Idempotent through `dedupeKey`
 * (e.g. `checkpoint:<id>`, `project:<submissionId>`, `standup:2026-11-23`).
 */
export async function awardPoints(
  input: {
    spaceId: string;
    communityId: string;
    userId: string;
    reason: Exclude<PointsReason, "ADJUSTMENT">;
    dedupeKey: string;
    refId?: string;
    trackId?: string | null;
    score?: number | null;
  },
  tx?: Tx,
) {
  const delta = pointsFor(input.reason, { score: input.score });
  if (delta <= 0) return;
  await (tx ?? db)
    .insert(pointsLedger)
    .values({
      spaceId: input.spaceId,
      communityId: input.communityId,
      userId: input.userId,
      trackId: input.trackId ?? null,
      reason: input.reason,
      delta,
      dedupeKey: input.dedupeKey,
      refId: input.refId,
    })
    .onConflictDoNothing();
}
