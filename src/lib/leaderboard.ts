/**
 * Leaderboards (and every learner-facing points total) update twice a day, at the same
 * moment for everyone. Times are UTC: 06:00 and 18:00 UTC = 7:00 AM and 7:00 PM in Lagos (WAT).
 * The schedule itself lives in pg_cron (README → Setup); keep both in sync.
 */
export const LEADERBOARD_UPDATE_HOURS_UTC = [6, 18] as const;
export const LEADERBOARD_CRON = "0 6,18 * * *";

/** The next scheduled update after `now`. */
export function nextLeaderboardUpdate(now = new Date()): Date {
  for (const add of [0, 1]) {
    for (const h of LEADERBOARD_UPDATE_HOURS_UTC) {
      const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + add, h));
      if (t > now) return t;
    }
  }
  throw new Error("unreachable");
}
