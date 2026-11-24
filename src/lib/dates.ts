/**
 * Calendar days in a community's timezone. Standups, streaks and "one per day" rules use
 * the community's local day, so a Lagos learner posting at 00:30 gets the new day.
 */

/** "YYYY-MM-DD" for `at` in `timeZone` (falls back to UTC for an unknown zone). */
export function localDate(timeZone: string, at = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

/** Shift a "YYYY-MM-DD" day by `days`. */
export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** A streak is alive if the learner showed up today or yesterday; otherwise it shows as 0. */
export function liveStreak(current: number, lastActiveDate: string | null, today: string): number {
  if (!lastActiveDate) return 0;
  return lastActiveDate === today || lastActiveDate === addDays(today, -1) ? current : 0;
}

/** Streak lengths that earn a bonus and a feed post. */
export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100] as const;

export function formatMinutes(seconds: number | null | undefined): string {
  if (!seconds) return "";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim();
}
