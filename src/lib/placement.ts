/**
 * Joining a space: onboarding questions + optional placement test.
 *
 * Onboarding picks the learner's starting TRACK and tells mentors about them.
 * It never sets a level: everyone starts at the first level of their track.
 *
 * The placement test lets someone who already knows the basics skip ahead, without
 * letting anyone type their way up:
 *   1. timed quiz, questions drawn at random from the track's bank (graded on the server)
 *   2. a small practical task from the track's brief, reviewed by a Mentor or above
 *   3. the reviewer RECOMMENDS (or not); a Mentor or Lead then records the promotion
 * DB rules (0001_integrity_rules.sql) back every step.
 */
export const PLACEMENT = {
  /** Questions drawn per attempt. */
  quizQuestions: 15,
  quizMinutes: 20,
  /** Below this the attempt ends after the quiz; at or above it the practical task opens. */
  quizPassPct: 70,
  /** One attempt per track in this window (DB-enforced). */
  retakeAfterDays: 30,
  /** The highest a placement test can reach. Advanced needs a mentor conversation. */
  maxTier: "INTERMEDIATE",
} as const;

/** Same four questions in every space, so any community can use them as they are. */
export const INTAKE_QUESTIONS = [
  { key: "goalTrackId", label: "Which track do you want to start with?", hint: "You can join another track later with a mentor's approval." },
  { key: "experience", label: "What have you built or studied so far?", hint: "Be honest: this helps your mentor, it doesn't set your level." },
  { key: "links", label: "Links to your work (optional)", hint: "GitHub, portfolio, a project you're proud of." },
  { key: "hoursPerWeek", label: "How many hours a week can you commit?", hint: "Used to pace your plan." },
] as const;
