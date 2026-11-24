/**
 * End-to-end scenarios: drives the real services as every role against a throwaway Postgres.
 * Run with `pnpm test:scenarios` (tests/scenarios/run.mjs sets up the database and a fake mailer).
 * The pool is a SINGLE connection: any query that escapes its transaction would hang here.
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL!;
(globalThis as { __lenigoSql?: unknown }).__lenigoSql = postgres(url, { prepare: false, max: 1, fetch_types: false, onnotice: () => {} });

const { db } = await import("@/server/db");
const S = await import("@/server/db/schema");
const curriculum = await import("@/server/services/curriculum");
const learning = await import("@/server/services/learning");
const placement = await import("@/server/services/placement");
const review = await import("@/server/services/review");
const social = await import("@/server/services/social");
const workshops = await import("@/server/services/workshops");
const profiles = await import("@/server/services/profiles");
const { sql, eq, and } = await import("drizzle-orm");
type MemberAccess = import("@/server/auth/access").MemberAccess;

let pass = 0;
let failCount = 0;
const failures: string[] = [];
async function ok<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    const r = await withTimeout(fn());
    pass++;
    console.log("  ✓", name);
    return r;
  } catch (e) {
    failCount++;
    failures.push(`${name}: ${msg(e)}`);
    console.log("  ✗", name, "→", msg(e));
  }
}
async function refuses(name: string, fn: () => Promise<unknown>, pattern: RegExp) {
  try {
    await withTimeout(fn());
    failCount++;
    failures.push(`${name}: expected refusal, got success`);
    console.log("  ✗", name, "→ expected refusal, but it succeeded");
  } catch (e) {
    if (pattern.test(msg(e))) {
      pass++;
      console.log("  ✓", name, `(refused: ${msg(e).slice(0, 80)})`);
    } else {
      failCount++;
      failures.push(`${name}: wrong error ${msg(e)}`);
      console.log("  ✗", name, "→ wrong error:", msg(e));
    }
  }
}
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log("  ✓", name);
  } else {
    failCount++;
    failures.push(`${name} ${detail}`);
    console.log("  ✗", name, detail);
  }
}
function msg(e: unknown): string {
  const x = e as { message?: string; cause?: { message?: string } };
  return x?.cause?.message ?? x?.message ?? String(e);
}
function withTimeout<T>(p: Promise<T>, ms = 15000): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("TIMEOUT (query outside its transaction?)")), ms))]);
}

/* ── Seed: users, community, space, roles ───────────────────────── */
const uid = () => crypto.randomUUID();
const U = { lead: uid(), owner: uid(), manager: uid(), mentor: uid(), a: uid(), b: uid(), outsider: uid() };
await db.insert(S.users).values(
  Object.entries(U).map(([k, id]) => ({ id, email: `${k}@example.test`, name: k[0].toUpperCase() + k.slice(1), username: `user-${k}` })),
);
const [community] = await db.insert(S.communities).values({ slug: "gdg-test", name: "GDG Test", timezone: "Africa/Lagos" }).returning();
const [space] = await db.insert(S.spaces).values({ communityId: community.id, slug: "web-dev", name: "Web Development" }).returning();
const [other] = await db.insert(S.spaces).values({ communityId: community.id, slug: "data", name: "Data" }).returning();
await db.insert(S.communityMembers).values([
  { communityId: community.id, userId: U.owner, role: "OWNER" },
  ...[U.lead, U.manager, U.mentor, U.a, U.b].map((userId) => ({ communityId: community.id, userId, role: "MEMBER" as const })),
]);
await db.insert(S.spaceMembers).values([
  { spaceId: space.id, communityId: community.id, userId: U.lead, role: "LEAD" },
  { spaceId: space.id, communityId: community.id, userId: U.manager, role: "MANAGER" },
  { spaceId: space.id, communityId: community.id, userId: U.mentor, role: "MENTOR" },
  { spaceId: space.id, communityId: community.id, userId: U.a, role: "MEMBER" },
  { spaceId: space.id, communityId: community.id, userId: U.b, role: "MEMBER" },
]);
const users = Object.fromEntries((await db.select().from(S.users)).map((u) => [u.id, u]));
const as = (userId: string, role: MemberAccess["spaceRole"], membership: MemberAccess["spaceMembershipRole"] = role, sp = space): MemberAccess => ({
  user: users[userId],
  community,
  membershipRole: userId === U.owner ? "OWNER" : "MEMBER",
  role: userId === U.owner ? "OWNER" : "MEMBER",
  isOverride: false,
  space: sp,
  spaceMembershipRole: membership,
  spaceRole: role,
});
const lead = as(U.lead, "LEAD");
const owner = as(U.owner, "LEAD", null); // community Owner: Lead through the community, not a space member
const manager = as(U.manager, "MANAGER");
const mentor = as(U.mentor, "MENTOR");
const A = as(U.a, "MEMBER");
const B = as(U.b, "MEMBER");
const crossSpace = as(U.lead, "LEAD", "LEAD", other);

console.log("\nCurriculum builder");
await refuses("a Mentor can't create a track", () => curriculum.createTrack(mentor, { title: "Frontend" }), /Only Leads and Managers/);
await refuses("a learner can't create a track", () => curriculum.createTrack(A, { title: "Frontend" }), /Only Leads and Managers/);
const fe = (await ok("Lead creates Frontend (3 levels)", () => curriculum.createTrack(lead, { title: "Frontend", description: "HTML to production" })))!;
const fs = (await ok("Manager creates Fullstack", () => curriculum.createTrack(manager, { title: "Fullstack" })))!;
const ed = (await ok("track editor loads", () => curriculum.getTrackEditor(lead, fe.id)))!;
check("three levels in order", ed.levels.map((l) => l.tier).join() === "BEGINNER,INTERMEDIATE,ADVANCED");
const [lvB, lvI] = ed.levels;
await refuses("another space can't read this track", () => curriculum.getTrackEditor(crossSpace, fe.id), /not found/i);
await ok("rename a level", () => curriculum.updateLevel(lead, lvB.id, { title: "HTML, CSS & JS" }));
await refuses("can't publish a track with no published first level", () => curriculum.updateTrack(lead, fe.id, { isPublished: true }), /Publish the first level/);

const m1 = (await ok("create module 1", () => curriculum.createModule(lead, lvB.id, { title: "The web, HTML and CSS" })))!;
const m2 = (await ok("create module 2", () => curriculum.createModule(lead, lvB.id, { title: "JavaScript basics" })))!;
const v1 = (await ok("add a YouTube video (10 min)", () => curriculum.addResource(lead, m1.id, { type: "VIDEO", title: "HTML crash course", url: "https://youtu.be/dQw4w9WgXcQ", minutes: 10 })))!;
check("YouTube id stored, URL rebuilt", v1.providerId === "dQw4w9WgXcQ" && v1.url === "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
await refuses("javascript: links are refused", () => curriculum.addResource(lead, m1.id, { type: "ARTICLE", title: "Bad link", url: "javascript:alert(1)" }), /https/);
await refuses("a video needs a length", () => curriculum.addResource(lead, m1.id, { type: "VIDEO", title: "No length", url: "https://youtu.be/dQw4w9WgXcQ" }), /length/);
await ok("add an article", () => curriculum.addResource(lead, m1.id, { type: "ARTICLE", title: "MDN HTML", url: "https://developer.mozilla.org/en-US/docs/Web/HTML", minutes: 5 }));
await refuses("can't publish without a brief", () => curriculum.updateModule(lead, m1.id, { isPublished: true }), /brief/);
await ok("write the brief", () => curriculum.updateModule(lead, m1.id, { projectBriefMd: "# Build a profile page\n- semantic HTML" }));
await refuses("can't publish without a checkpoint", () => curriculum.updateModule(lead, m1.id, { isPublished: true }), /checkpoint/);
const cp1 = (await ok("add checkpoint after the video", () => curriculum.addCheckpoint(lead, m1.id, { title: "HTML basics", afterResourceId: v1.id, passThreshold: 80 })))!;
await refuses("can't publish with an empty checkpoint", () => curriculum.updateModule(lead, m1.id, { isPublished: true }), /no questions/);
await ok("add question 1", () => curriculum.addQuestion(lead, cp1.id, { prompt: "Which tag is a heading?", options: ["<p>", "<h1>", "<div>"], correctOptionIndex: 1, explanation: "h1–h6 are headings" }));
await ok("add question 2", () => curriculum.addQuestion(lead, cp1.id, { prompt: "Is CSS a language for styling?", options: ["Yes", "No"], correctOptionIndex: 0 }));
await refuses("duplicate options refused", () => curriculum.addQuestion(lead, cp1.id, { prompt: "Dup?", options: ["a", "a"], correctOptionIndex: 0 }), /different/);
await ok("publish module 1", () => curriculum.updateModule(lead, m1.id, { isPublished: true }));
await ok("module 2 gets a brief + checkpoint + question and is published", async () => {
  await curriculum.updateModule(lead, m2.id, { projectBriefMd: "Build a todo app" });
  const c = await curriculum.addCheckpoint(lead, m2.id, { title: "JS" });
  await curriculum.addQuestion(lead, c.id, { prompt: "typeof 1?", options: ["number", "string"], correctOptionIndex: 0 });
  await curriculum.updateModule(lead, m2.id, { isPublished: true });
});
await ok("publish level 1 and the track", async () => {
  await curriculum.updateLevel(lead, lvB.id, { isPublished: true });
  await curriculum.updateTrack(lead, fe.id, { isPublished: true });
});
// Intermediate: core + two options
const core = (await ok("intermediate core module", () => curriculum.createModule(lead, lvI.id, { title: "Components and state" })))!;
const react = (await ok("option React + Next", () => curriculum.createBranch(lead, lvI.id, { title: "React + Next.js" })))!;
const vue = (await ok("option Vue + Nuxt", () => curriculum.createBranch(lead, lvI.id, { title: "Vue + Nuxt" })))!;
const rm = (await ok("React-only module", () => curriculum.createModule(lead, lvI.id, { title: "Next.js app router", branchId: react.id })))!;
await refuses("a branch from another level is refused", () => curriculum.createModule(lead, lvB.id, { title: "Wrong level", branchId: react.id }), /another level/);
await ok("publish intermediate modules and level", async () => {
  for (const m of [core, rm]) {
    await curriculum.updateModule(lead, m.id, { projectBriefMd: "Build it" });
    const c = await curriculum.addCheckpoint(lead, m.id, { title: "Check" });
    await curriculum.addQuestion(lead, c.id, { prompt: "Which one?", options: ["a", "b"], correctOptionIndex: 0 });
    await curriculum.updateModule(lead, m.id, { isPublished: true });
  }
  await curriculum.updateLevel(lead, lvI.id, { isPublished: true });
});
// Fullstack needs Frontend Intermediate
await ok("Fullstack requires Frontend Intermediate", () => curriculum.updateTrack(lead, fs.id, { prerequisiteTrackId: fe.id, prerequisiteTier: "INTERMEDIATE" }));
await refuses("no prerequisite cycles", () => curriculum.updateTrack(lead, fe.id, { prerequisiteTrackId: fs.id }), /already requires/);
await ok("publish Fullstack", async () => {
  const e = await curriculum.getTrackEditor(lead, fs.id);
  const m = await curriculum.createModule(lead, e.levels[0].id, { title: "Auth" });
  await curriculum.updateModule(lead, m.id, { projectBriefMd: "x" });
  const c = await curriculum.addCheckpoint(lead, m.id, { title: "Check" });
  await curriculum.addQuestion(lead, c.id, { prompt: "Which one?", options: ["a", "b"], correctOptionIndex: 0 });
  await curriculum.updateModule(lead, m.id, { isPublished: true });
  await curriculum.updateLevel(lead, e.levels[0].id, { isPublished: true });
  await curriculum.updateTrack(lead, fs.id, { isPublished: true });
});

console.log("\nOnboarding and enrolment");
await refuses("can't start with a track that has a prerequisite", () => learning.completeOnboarding(B, { goalTrackId: fs.id, experience: "Some HTML at school", links: [], hoursPerWeek: 5 }), /prerequisite/);
await refuses("intake links must be https", () => learning.completeOnboarding(A, { goalTrackId: fe.id, experience: "Built a site", links: ["http://x.com"], hoursPerWeek: 5 }), /https/);
const onA = await ok("learner A onboards into Frontend", () => learning.completeOnboarding(A, { goalTrackId: fe.id, experience: "I built a portfolio once", links: ["https://github.com/a"], hoursPerWeek: 8 }));
check("A is enrolled", !!onA?.enrolled);
await ok("learner B onboards into Frontend", () => learning.completeOnboarding(B, { goalTrackId: fe.id, experience: "I know HTML and CSS well", links: [], hoursPerWeek: 10 }));
const eA = (await db.select().from(S.trackEnrollments).where(eq(S.trackEnrollments.userId, U.a)))[0];
const eB = (await db.select().from(S.trackEnrollments).where(eq(S.trackEnrollments.userId, U.b)))[0];
await refuses("DB: learner can't self-enrol in a second track", () => db.insert(S.trackEnrollments).values({ trackId: fs.id, spaceId: space.id, communityId: community.id, userId: U.a }), /approval|prerequisite/);
await refuses("DB: a learner can't raise their own tier", () => db.update(S.trackEnrollments).set({ tier: "ADVANCED" }).where(eq(S.trackEnrollments.id, eA.id)), /recorded promotion/);

console.log("\nRoadmap and locks");
let pA = (await ok("A's progress loads", () => learning.loadTrackProgress({ trackId: fe.id, userId: U.a, enrollment: eA, preview: false })))!;
const allA = () => pA.levels.flatMap((l) => l.modules);
check("module 1 open and active", pA.activeModuleId === m1.id && !allA().find((m) => m.id === m1.id)!.locked);
check("module 2 locked", allA().find((m) => m.id === m2.id)!.locked);
check("intermediate hidden from a beginner", !pA.levels.find((l) => l.tier === "INTERMEDIATE")!.reachable && pA.levels.find((l) => l.tier === "INTERMEDIATE")!.modules.length === 0);
await refuses("A can't open module 2's checkpoint (no skipping)", async () => {
  const [c] = await db.select().from(S.checkpoints).where(eq(S.checkpoints.moduleId, m2.id));
  return learning.submitCheckpoint(A, c.id, [0]);
}, /No skipping|previous module|before this one/);
const ws = (await ok("workspace loads for A", () => learning.getModuleWorkspace(A, m1.id)))!;
check("answer keys never reach learners", ws.checkpoints.every((c) => c.questions.every((q) => !("correctOptionIndex" in q))));
const wsMentor = (await ok("mentor preview loads", () => learning.getModuleWorkspace(mentor, m1.id)))!;
check("mentor preview shows keys", wsMentor.preview && wsMentor.checkpoints[0].questions.every((q) => "correctOptionIndex" in q));
await refuses("an outsider can't open it", () => learning.getModuleWorkspace(as(U.outsider, "MEMBER"), m1.id), /Join this track/);

console.log("\nWatch time (server-credited)");
const back = (s: number) => db.execute(sql`update resource_progress set last_heartbeat_at = now() - make_interval(secs => ${s}) where resource_id = ${v1.id} and user_id = ${U.a}`);
await ok("first heartbeat is a baseline", () => learning.recordHeartbeat(A, v1.id, { position: 0, playing: false }));
await back(10);
const seek = await ok("seek to the end after 10 s", () => learning.recordHeartbeat(A, v1.id, { position: 590, playing: true, rate: 1 }));
check("seeking credits at most the wall-clock time", (seek?.watchedPct ?? 99) <= 2, `pct=${seek?.watchedPct}`);
await refuses("checkpoint still closed before the video is done", () => learning.submitCheckpoint(A, cp1.id, [1, 0]), /Finish "HTML crash course"/);
await ok("pause → baseline at 0", () => learning.recordHeartbeat(A, v1.id, { position: 0, playing: false }));
let last: { watchedPct: number; completed: boolean } | undefined;
for (let pos = 60; pos <= 600 && !last?.completed; pos += 60) {
  await back(60);
  last = await learning.recordHeartbeat(A, v1.id, { position: pos, playing: true, rate: 1 });
}
check("video completes after real playback", !!last?.completed, JSON.stringify(last));
await back(200);
const gap = await learning.recordHeartbeat(A, v1.id, { position: 600, playing: true });
check("completed stays completed", gap.completed);

console.log("\nCheckpoints");
const fail1 = await ok("B fails (wrong) — needs the video first? (B hasn't watched)", async () => {
  try {
    return await learning.submitCheckpoint(B, cp1.id, [0, 1]);
  } catch (e) {
    return { blocked: msg(e) };
  }
});
check("B is blocked until B watches the video", JSON.stringify(fail1).includes("Finish"));
const r1 = await ok("A answers wrong", () => learning.submitCheckpoint(A, cp1.id, [0, 1]));
check("a miss reveals which, not the answers", !!r1 && !r1.passed && r1.wrong.length === 2 && r1.explanations.length === 0);
await ok("A misses again", () => learning.submitCheckpoint(A, cp1.id, [0, 0]));
await refuses("two misses → cooldown", () => learning.submitCheckpoint(A, cp1.id, [1, 0]), /Two misses/);
// Fast-forward the cooldown (attempts are append-only; insert an old passing attempt is NOT allowed — instead move the clock by deleting nothing)
await db.execute(sql`alter table quiz_attempts disable trigger quiz_attempts_append_only`);
await db.execute(sql`update quiz_attempts set created_at = now() - interval '11 minutes' where user_id = ${U.a}`);
await db.execute(sql`alter table quiz_attempts enable trigger quiz_attempts_append_only`);
const r3 = await ok("after the cooldown A passes", () => learning.submitCheckpoint(A, cp1.id, [1, 0]));
check("a pass returns explanations", !!r3?.passed && r3.explanations[0] === "h1–h6 are headings");
await refuses("can't retake a passed checkpoint", () => learning.submitCheckpoint(A, cp1.id, [1, 0]), /already passed/);

console.log("\nCapstone and review");
await refuses("B can't submit before finishing the module", () => learning.submitProject(B, m1.id, { repoUrl: "https://github.com/b/x" }), /Watch every lesson/);
await refuses("repo must be https", () => learning.submitProject(A, m1.id, { repoUrl: "http://github.com/a/x" }), /https/);
const sub = (await ok("A submits the project", () => learning.submitProject(A, m1.id, { repoUrl: "https://github.com/a/profile", liveUrl: "https://a.dev" })))!;
await refuses("no double submit", () => learning.submitProject(A, m1.id, { repoUrl: "https://github.com/a/profile" }), /waiting for a mentor/);
await refuses("a learner can't review", () => review.reviewSubmission(B, sub.id, { decision: "APPROVED", score: 100, feedback: "Looks great to me!" }), /permission/);
await refuses("approve needs a score", () => review.reviewSubmission(mentor, sub.id, { decision: "APPROVED", feedback: "Good work overall" }), /Score/);
await refuses("feedback is required", () => review.reviewSubmission(mentor, sub.id, { decision: "NEEDS_REVISION", feedback: "meh" }), /feedback/);
await ok("mentor requests changes", () => review.reviewSubmission(mentor, sub.id, { decision: "NEEDS_REVISION", feedback: "Add alt text to the images please." }));
const sub2 = (await ok("A resubmits", () => learning.submitProject(A, m1.id, { repoUrl: "https://github.com/a/profile" })))!;
await ok("manager approves with 80", () => review.reviewSubmission(manager, sub2.id, { decision: "APPROVED", score: 80, feedback: "Much better, nicely done." }));
await refuses("DB: reviewer must be staff", () => db.insert(S.submissionReviews).values({ submissionId: sub2.id, spaceId: space.id, reviewerId: U.b, decision: "APPROVED", score: 100, feedback: "x" }), /Mentor or above/);
const pts = await db.execute<{ reason: string; delta: number }>(sql`select reason, delta from points_ledger where user_id = ${U.a} order by id`);
check("points: video, checkpoint, project×score", pts.map((p) => `${p.reason}:${p.delta}`).join() === "VIDEO_COMPLETED:2,CHECKPOINT_PASSED:20,PROJECT_APPROVED:80", pts.map((p) => `${p.reason}:${p.delta}`).join());
const queue = (await ok("review queue loads", () => review.getReviewQueue(mentor)))!;
check("queue is empty and turnaround counted", queue.pending.length === 0 && queue.turnaround.n === 2);

console.log("\nPromotion");
pA = await learning.loadTrackProgress({ trackId: fe.id, userId: U.a, enrollment: eA, preview: false });
check("module 2 now open", pA.activeModuleId === m2.id);
await refuses("Manager can't promote", () => learning.promoteLearner(manager, eA.id, { reason: "Finished the level, great work" }), /Only Mentors and Leads/);
await refuses("nobody promotes themselves", () => learning.promoteLearner(as(U.a, "MENTOR"), eA.id, { reason: "I deserve this one" }), /yourself/);
await refuses("a reason is required", () => learning.promoteLearner(mentor, eA.id, { reason: "ok" }), /reason/);
await ok("community Owner (Lead through the community) promotes A", () => learning.promoteLearner(owner, eA.id, { reason: "Strong first project, ready for frameworks." }));
const eA2 = (await db.select().from(S.trackEnrollments).where(eq(S.trackEnrollments.id, eA.id)))[0];
check("A is Intermediate", eA2.tier === "INTERMEDIATE");
pA = await learning.loadTrackProgress({ trackId: fe.id, userId: U.a, enrollment: eA2, preview: false });
const inter = pA.levels.find((l) => l.tier === "INTERMEDIATE")!;
check("intermediate visible; options need a pick", inter.reachable && inter.needsBranch && inter.modules.every((m) => !m.branchId));
await refuses("B can't pick a branch above their level", () => learning.chooseBranch(B, eB.id, react.id), /reach that level/);
await refuses("B can't choose for A", () => learning.chooseBranch(B, eA.id, react.id), /Only the learner/);
await ok("A picks React", () => learning.chooseBranch(A, eA.id, react.id));
await ok("A switches to Vue before starting", () => learning.chooseBranch(A, eA.id, vue.id));
await ok("A switches back to React", () => learning.chooseBranch(A, eA.id, react.id));
const feedPromo = await db.select().from(S.feedItems).where(eq(S.feedItems.kind, "LEVEL_PROMOTED"));
check("promotion posted to the feed", feedPromo.length === 1 && feedPromo[0].meta.level === "Intermediate");

console.log("\nSecond track");
await refuses("a learner can't add themselves", () => learning.enrolLearner(A, { userId: U.a, trackId: fs.id }), /Only Mentors and Leads/);
await refuses("prerequisite still applies (B is Beginner)", () => learning.enrolLearner(mentor, { userId: U.b, trackId: fs.id }), /prerequisite/);
await ok("mentor adds A to Fullstack", () => learning.enrolLearner(mentor, { userId: U.a, trackId: fs.id, note: "Ready" }));
await refuses("not twice", () => learning.enrolLearner(mentor, { userId: U.a, trackId: fs.id }), /already/);

console.log("\nPlacement test");
await ok("track offers a test (task + 5 questions)", async () => {
  await curriculum.updateTrack(lead, fe.id, { placementTaskMd: "Build a landing page" });
  for (let i = 0; i < 6; i++) await curriculum.addPlacementQuestion(lead, fe.id, { prompt: `P${i}?`, options: ["right", "wrong"], correctOptionIndex: 0 });
});
await refuses("only Beginners can take it", () => placement.startPlacement(A, fe.id), /first level/);
const att = (await ok("B starts the test", () => placement.startPlacement(B, fe.id)))!;
await refuses("30-day rule", () => placement.startPlacement(B, fe.id), /again on/);
const view = (await ok("B sees questions without keys", () => placement.getPlacementAttempt(B, att.id)))!;
check("no keys in the served quiz", view.questions.length === 6 && view.questions.every((q) => !("correctOptionIndex" in q)));
await refuses("A can't open B's test", () => placement.getPlacementAttempt(A, att.id), /not found/);
const quiz = await ok("B passes the quiz", () => placement.submitPlacementQuiz(B, att.id, view.questions.map(() => 0)));
check("quiz 100%", quiz?.scorePct === 100 && quiz.passed);
await ok("B submits the task", () => placement.submitPlacementTask(B, att.id, { repoUrl: "https://github.com/b/landing" }));
await refuses("B can't review their own", () => placement.reviewPlacement(as(U.b, "MENTOR"), att.id, { decision: "RECOMMENDED", feedback: "Looks good to me" }), /own/);
await ok("mentor recommends", () => placement.reviewPlacement(mentor, att.id, { decision: "RECOMMENDED", feedback: "Clean, responsive, semantic." }));
const q2 = await review.getReviewQueue(mentor);
check("recommended test waits for a promotion", q2.placementsToPromote.length === 1);
await ok("mentor promotes B via the placement", () => learning.promoteLearner(mentor, eB.id, { reason: "Passed the placement test and task.", placementAttemptId: att.id }));
const eB2 = (await db.select().from(S.trackEnrollments).where(eq(S.trackEnrollments.id, eB.id)))[0];
const pB = await learning.loadTrackProgress({ trackId: fe.id, userId: U.b, enrollment: eB2, preview: false });
check("B's beginner modules are placed out and don't gate", pB.placedInto === "INTERMEDIATE" && pB.levels[0].modules.every((m) => m.placedOut && !m.locked));
check("B's next step is the intermediate core", pB.activeModuleId === core.id);

console.log("\nStandups, streaks, feed");
const su = await ok("A posts a standup", () => social.postStandup(A, { didToday: "Finished the HTML module today", nextStep: "Start React", blockers: "Stuck on flexbox" }));
check("streak starts at 1", su?.streak === 1);
await refuses("one per day", () => social.postStandup(A, { didToday: "Second post same day", nextStep: "Keep going" }), /already posted/);
await db.execute(sql`update streaks set last_active_date = (current_date - 1), current = 2 where user_id = ${U.b}`); // no row yet → no-op
await db.insert(S.streaks).values({ spaceId: space.id, userId: U.b, current: 2, longest: 2, lastActiveDate: sql`(now() at time zone 'Africa/Lagos')::date - 1` as unknown as string });
const su2 = await ok("B continues a 2-day streak", () => social.postStandup(B, { didToday: "Built the components module", nextStep: "Props and state" }));
check("milestone at 3 days", su2?.streak === 3 && su2.milestone === 3);
const feed = (await ok("feed loads", () => social.listFeed(A)))!;
check("feed has standups, milestone, promotions, project", ["STANDUP", "STREAK_MILESTONE", "LEVEL_PROMOTED", "PROJECT_APPROVED"].every((k) => feed.items.some((i) => i.kind === k)));
const help = await social.listFeed(A, { helpOnly: true });
check("help filter finds the blocker", help.items.length === 1 && help.items[0].helpNeeded);
const proj = feed.items.find((i) => i.kind === "PROJECT_APPROVED")!;
check("project posts don't leak the score", !JSON.stringify(proj).includes('"score"'));
await ok("B reacts 🔥", () => social.toggleReaction(B, proj.id, "🔥"));
const again = await social.toggleReaction(B, proj.id, "🔥");
check("reacting twice toggles off", again.on === false);
await refuses("unknown emoji refused", () => social.toggleReaction(B, proj.id, "💩"), /Unknown/);
const cm = (await ok("B comments", () => social.addComment(B, proj.id, "Congrats!")))!;
await refuses("A can't delete B's comment", () => social.deleteComment(A, cm.id), /permission/);
await ok("Manager (moderator) can", () => social.deleteComment(manager, cm.id));
await refuses("another space can't react", () => social.toggleReaction(crossSpace, proj.id, "🔥"), /not found/i);

console.log("\nLeaderboard");
const before = await social.getLeaderboard(space.id);
check("no board before the first snapshot", before.rows.length === 0);
await db.execute(sql`select lenigo_snapshot_leaderboards()`);
const board = await social.getLeaderboard(space.id);
check("board ranks learners only", board.rows.length === 2 && board.rows.every((r) => [U.a, U.b].includes(r.user.id)));
const standing = await social.getStanding(space.id, U.a);
check("A's standing from the snapshot", standing?.rank === 1 && standing.points >= 102, JSON.stringify(standing));

console.log("\nWorkshops");
await refuses("a learner can't schedule", () => workshops.createWorkshop(A, { title: "Hack night", kind: "WORKSHOP", type: "PHYSICAL", startsAt: new Date(Date.now() + 3600e3).toISOString(), venue: "Lab" }), /Mentors and above/);
await refuses("online needs a link", () => workshops.createWorkshop(mentor, { title: "Git 101", kind: "WORKSHOP", type: "ONLINE_CALL", startsAt: new Date(Date.now() + 3600e3).toISOString() }), /call link/);
const w = (await ok("mentor schedules a standup review", () => workshops.createWorkshop(mentor, { title: "Friday demos", kind: "STANDUP_REVIEW", type: "ONLINE_CALL", startsAt: new Date(Date.now() + 3600e3).toISOString(), meetingUrl: "https://meet.google.com/abc-defg-hij" })))!;
const beforeRsvp = await workshops.listWorkshops(B);
check("call link hidden until you RSVP", beforeRsvp.upcoming[0].meetingUrl === null);
await refuses("present only your own project", () => workshops.rsvp(B, w.id, { going: true, submissionId: sub2.id }), /your own/);
await ok("A RSVPs to present the project", () => workshops.rsvp(A, w.id, { going: true, submissionId: sub2.id }));
const afterRsvp = await workshops.listWorkshops(A);
check("call link shown after RSVP; presenting queue", afterRsvp.upcoming[0].meetingUrl !== null && afterRsvp.upcoming[0].attendees.some((x) => x.presenting));
await refuses("attendance only after it starts", () => workshops.markAttendance(mentor, w.id, U.a), /has started/);
await db.update(S.workshops).set({ startsAt: new Date(Date.now() - 600e3) }).where(eq(S.workshops.id, w.id));
await refuses("learners can't mark attendance", () => workshops.markAttendance(B, w.id, U.a), /permission/);
await refuses("nobody marks themselves", () => workshops.markAttendance(mentor, w.id, U.mentor), /Someone else/);
await ok("mentor marks A attended", () => workshops.markAttendance(mentor, w.id, U.a));
await ok("marking twice is harmless (points once)", () => workshops.markAttendance(mentor, w.id, U.a));
const wp = await db.execute<{ n: number }>(sql`select count(*)::int n from points_ledger where user_id = ${U.a} and reason = 'REVIEW_SESSION_ATTENDED'`);
check("attendance points once", wp[0].n === 1);
await refuses("DB: attendance can't be unmarked", () => db.update(S.workshopRsvps).set({ attended: false }).where(and(eq(S.workshopRsvps.workshopId, w.id), eq(S.workshopRsvps.userId, U.a))), /unmarked|Mentor or above/);
await refuses("can't un-RSVP after attending", () => workshops.rsvp(A, w.id, { going: false }), /already recorded/);
await refuses("can't cancel a started session", () => workshops.cancelWorkshop(mentor, w.id), /started/);

console.log("\nLearners overview and profiles");
const ls = (await ok("learners overview", () => review.listLearners(mentor)))!;
const la = ls.learners.find((l) => l.id === U.a)!;
check("A shows two tracks with levels", la.enrollments.length === 2 && la.enrollments.some((e) => e.tier === "INTERMEDIATE"));
await refuses("learners can't see the overview", () => review.listLearners(A), /permission/);
await ok("A sets a username and bio", () => profiles.updateProfile(users[U.a], { username: "ada-builds", bio: "Learning React" }));
await refuses("username taken", () => profiles.updateProfile(users[U.b], { username: "ada-builds" }), /taken/);
await refuses("reserved username", () => profiles.updateProfile(users[U.b], { username: "admin" }), /reserved/);
const prof = await profiles.getPublicProfile("ADA-builds");
check("public profile: levels and approved project, no email", !!prof && prof.projects.length === 1 && prof.levels.length === 2 && !JSON.stringify(prof).includes("@example.test"));

console.log("\nCurriculum safety");
await refuses("can't delete a module with progress", () => curriculum.deleteModule(lead, m1.id), /progress/);
await refuses("can't delete a track with learners", () => curriculum.deleteTrack(lead, fe.id), /Unpublish/);
await refuses("can't delete a watched video", () => curriculum.deleteResource(lead, v1.id), /watched/);
await refuses("can't delete a chosen option", () => curriculum.deleteBranch(lead, react.id), /picked/);
await ok("reorder modules", () => curriculum.moveModule(lead, m2.id, "up"));

console.log("\nGlobal House health (Phase 1 subquery fix)");
const { listCommunityHealth } = await import("@/server/services/communities");
const health = (await listCommunityHealth()).find((r) => r.slug === "gdg-test") as Record<string, unknown> | undefined;
check("health counts spaces, members, shipped, owner", health?.spaces === 2 && health?.members === 6 && health?.shipped === 1 && health?.owner === "Owner", JSON.stringify(health));

const admin = await import("@/server/services/admin");
const days = await admin.activityByDay(7);
check("activity chart query runs", Array.isArray(days) && days.length === 7, JSON.stringify(days).slice(0, 120));
const totals = await (await import("@/server/services/communities")).getGlobalTotals();
check("global totals", totals.communities === 1 && totals.users === 7, JSON.stringify(totals));

/* ── Phase 1: provisioning, invites, roles and people management ── */
type Mail = { to: { email_address: { address: string } }[]; subject: string; htmlbody: string; textbody: string };
const mails = async () => (await (await fetch(process.env.MAIL_SINK_URL!)).json()) as Mail[];
const clearMail = () => fetch(process.env.MAIL_SINK_URL!, { method: "DELETE" });
const mailsTo = async (email: string) => (await mails()).filter((m) => m.to.some((t) => t.email_address.address === email));
const tokenOf = (url: string) => new URL(url).pathname.split("/").pop()!;
const statusOf = async (p: Promise<unknown>) => p.then(() => 200, (e: { status?: number }) => e?.status ?? 500);

const C = await import("@/server/services/communities");
const I = await import("@/server/services/invites");
const Acc = await import("@/server/auth/access");
const Adm = await import("@/server/services/admin");
const Perm = await import("@/lib/permissions");

console.log("\nPhase 1: provisioning");
await clearMail();
const P = { root: uid(), owner: uid(), lead: uid(), mgr: uid(), mentor: uid(), member: uid(), other: uid() };
await db.insert(S.users).values(
  Object.entries(P).map(([k, id]) => ({
    id,
    email: k === "root" ? "root@example.test" : `p1-${k}@example.test`,
    name: `P1 ${k}`,
    username: `p1-${k}`,
    globalRole: k === "root" ? ("SUPER_ADMIN" as const) : ("USER" as const),
  })),
);
const pu = async (id: string) => (await db.select().from(S.users).where(eq(S.users.id, id)))[0];
const root = await pu(P.root);
const [pOwner, pLead, pMgr, pMentor, pMember, pOther] = await Promise.all([P.owner, P.lead, P.mgr, P.mentor, P.member, P.other].map(pu));

await refuses("a regular user can't provision", () => C.provisionCommunity(pOwner, { name: "X", slug: "x-club", ownerEmail: "x@example.test", spaces: [] }), /permission/);
const prov = (await ok("Super Admin provisions gdg-oau (Web Development + Data Science)", () =>
  C.provisionCommunity(root, { name: "GDG OAU", slug: "gdg-oau", ownerEmail: "P1-Owner@example.test", spaces: ["Web Development", "Data Science"], timezone: "Africa/Lagos" }),
))!;
check("two spaces; existing owner made Owner; invite emailed", prov.spaces.length === 2 && prov.ownerAlreadyMember && prov.ownerInvite.emailed);
const ownerMail = await mailsTo("p1-owner@example.test");
check("owner got one branded invite email", ownerMail.length === 1 && ownerMail[0].subject === "You're invited to GDG OAU on Lenigo");
check("existing account: no one-click key in the email", !ownerMail[0].htmlbody.includes("?k="));
await refuses("slug can't be reused", () => C.provisionCommunity(root, { name: "Again", slug: "gdg-oau", ownerEmail: "y@example.test", spaces: [] }), /taken/);

const ownerC = await Acc.getCommunityAccess(pOwner, "gdg-oau");
check("owner is Community Lead (OWNER)", ownerC.role === "OWNER");
const ownerWeb = await Acc.getSpaceAccess(pOwner, "gdg-oau", "web-development");
const ownerData = await Acc.getSpaceAccess(pOwner, "gdg-oau", "data-science");
check("owner is LEAD in both spaces", ownerWeb.spaceRole === "LEAD" && ownerData.spaceRole === "LEAD");

console.log("\nPhase 1: space invites and role limits");
await clearMail();
const leadInv = (await ok("owner invites a Lead to web-development by email", () => I.createSpaceInvite(ownerWeb, "LEAD", { email: "p1-lead@example.test" })))!;
check("invite emailed", leadInv.emailed && (await mailsTo("p1-lead@example.test")).length === 1);
await refuses("a different account can't accept an email invite", () => I.redeemInvite(pOther, tokenOf(leadInv.url)), /sent to p1/);
await ok("lead accepts", () => I.redeemInvite(pLead, tokenOf(leadInv.url)));
await ok("accepting again is harmless", () => I.redeemInvite(pLead, tokenOf(leadInv.url)));
const leadWeb = await Acc.getSpaceAccess(pLead, "gdg-oau", "web-development");
check("lead is LEAD of web-development and a community MEMBER", leadWeb.spaceRole === "LEAD" && leadWeb.role === "MEMBER");
check("lead has no role in data-science", (await Acc.getSpaceAccess(pLead, "gdg-oau", "data-science")).spaceRole === null);
const mgrInv = (await ok("lead invites a Manager", () => I.createSpaceInvite(leadWeb, "MANAGER", { email: "p1-mgr@example.test" })))!;
const mentorInv = (await ok("lead invites a Mentor", () => I.createSpaceInvite(leadWeb, "MENTOR", { email: "p1-mentor@example.test" })))!;
await ok("manager and mentor accept", async () => {
  await I.redeemInvite(pMgr, tokenOf(mgrInv.url));
  await I.redeemInvite(pMentor, tokenOf(mentorInv.url));
});
const mgrWeb = await Acc.getSpaceAccess(pMgr, "gdg-oau", "web-development");
const mentorWeb = await Acc.getSpaceAccess(pMentor, "gdg-oau", "web-development");
check("manager's invite picker has no Lead/Manager", Perm.space.invitableRoles(mgrWeb.spaceRole).join() === "MENTOR,MEMBER");
check("API refuses a Manager inviting a Lead (403)", (await statusOf(I.createSpaceInvite(mgrWeb, "LEAD", { email: "z@example.test" }))) === 403);
check("API refuses a Manager inviting a Manager (403)", (await statusOf(I.createSpaceInvite(mgrWeb, "MANAGER", { email: "z@example.test" }))) === 403);
await ok("manager invites a Mentor", () => I.createSpaceInvite(mgrWeb, "MENTOR", { email: "z1@example.test", sendEmail: false }));
check(
  "mentor: no /team or /curriculum, yes /review",
  !Perm.space.canViewTeam(mentorWeb.spaceRole) && !Perm.space.canEditCurriculum(mentorWeb.spaceRole) && Perm.space.canReview(mentorWeb.spaceRole),
);
check("API refuses a Mentor inviting anyone (403)", (await statusOf(I.createSpaceInvite(mentorWeb, "MEMBER", { email: "z@example.test" }))) === 403);
await refuses("a Manager can't promote a Mentor to Lead", () => C.changeSpaceRole(mgrWeb, P.mentor, "LEAD"), /permission/);
await refuses("nobody changes their own role", () => C.changeSpaceRole(leadWeb, P.lead, "MEMBER"), /own role/);

console.log("\nPhase 1: joining spaces");
const design = (await ok("owner adds an OPEN space", () => C.createSpace(ownerC, { name: "Design", joinPolicy: "OPEN" })))!;
await ok("owner adds an INVITE space", () => C.createSpace(ownerC, { name: "Core Team", joinPolicy: "INVITE" }));
const link = (await ok("owner makes a single-use member link", () => I.createCommunityInvite(ownerC, "MEMBER", { maxUses: 1 })))!;
await ok("member joins with the link", () => I.redeemInvite(pMember, tokenOf(link.url)));
await refuses("a single-use link can't be used twice", () => I.redeemInvite(pOther, tokenOf(link.url)), /already been used/);
const memberDesign = await Acc.getSpaceAccess(pMember, "gdg-oau", design.slug);
check("member sees the OPEN space without a role yet", memberDesign.spaceRole === null);
await ok("member self-joins the OPEN space", () => C.joinOpenSpace(memberDesign));
check("member is now a MEMBER there", (await Acc.getSpaceAccess(pMember, "gdg-oau", design.slug)).spaceRole === "MEMBER");
await refuses("member can't see the INVITE space", () => Acc.getSpaceAccess(pMember, "gdg-oau", "core-team"), /not found/i);
await refuses("an outsider can't see the community", () => Acc.getCommunityAccess(pOther, "gdg-oau"), /not found/i);
check("Super Admin opens any space as Lead (override)", (await Acc.getSpaceAccess(root, "gdg-oau", "core-team")).spaceRole === "LEAD");

console.log("\nPhase 1: suspension");
await refuses("a community Owner can't suspend", () => C.setCommunityStatus(pOwner, prov.community.id, "SUSPENDED"), /permission/);
await ok("Super Admin suspends gdg-oau", () => C.setCommunityStatus(root, prov.community.id, "SUSPENDED"));
check("members are blocked (410)", (await statusOf(Acc.getCommunityAccess(pMember, "gdg-oau"))) === 410);
check("the owner is blocked too (410)", (await statusOf(Acc.getSpaceAccess(pOwner, "gdg-oau", "web-development"))) === 410);
await ok("Super Admin still gets in", () => Acc.getCommunityAccess(root, "gdg-oau"));
const lateInv = await I.createSpaceInvite(await Acc.getSpaceAccess(root, "gdg-oau", "web-development"), "MEMBER", { email: "late@example.test", sendEmail: false });
const pv = await I.previewInvite(tokenOf(lateInv.url));
check("invites say the community is suspended", !pv.ok && /suspended/.test(pv.reason));
await ok("Super Admin reactivates", () => C.setCommunityStatus(root, prov.community.id, "ACTIVE"));
check("members are back in", (await statusOf(Acc.getCommunityAccess(pMember, "gdg-oau"))) === 200);

console.log("\nPhase 1: database rules");
await refuses("DB: points_ledger is append-only (UPDATE)", () => db.execute(sql`update points_ledger set delta = 999`), /append-only/);
await refuses("DB: points_ledger is append-only (DELETE)", () => db.execute(sql`delete from points_ledger`), /append-only/);
await refuses("DB: activity_logs is append-only", () => db.execute(sql`update activity_logs set action_type = 'LOGIN'`), /append-only/);

console.log("\nPeople management: hand over the Community Lead");
const rootC = await Acc.getCommunityAccess(root, "gdg-oau");
await refuses("only the Community Lead hands over", () => C.handOverLead({ ...ownerC, role: "ADMIN" }, P.lead), /permission/);
await refuses("hand over to someone outside the community", () => C.handOverLead(ownerC, P.other), /member of the community/);
await ok("owner hands over to the web lead", () => C.handOverLead(ownerC, P.lead));
const roleIn = async (id: string) =>
  (await db.select({ r: S.communityMembers.role }).from(S.communityMembers).where(and(eq(S.communityMembers.communityId, prov.community.id), eq(S.communityMembers.userId, id))))[0]?.r;
check("new Lead is OWNER, old Lead is ADMIN", (await roleIn(P.lead)) === "OWNER" && (await roleIn(P.owner)) === "ADMIN");
await refuses("demoting the last Community Lead fails", () => C.changeCommunityRole(rootC, P.lead, "ADMIN"), /at least one Community Lead/);
await refuses("removing the last Community Lead fails", () => C.removeCommunityMember(rootC, P.lead), /at least one Community Lead/);
await refuses("an Admin can't demote the Lead", () => C.changeCommunityRole({ ...ownerC, role: "ADMIN", membershipRole: "ADMIN" }, P.lead, "MEMBER"), /permission/);
const newLeadC = await Acc.getCommunityAccess(pLead, "gdg-oau");

console.log("\nPeople management: remove and invite back");
await db.insert(S.pointsLedger).values({ spaceId: design.id, communityId: prov.community.id, userId: P.member, delta: 5, reason: "STANDUP", dedupeKey: "standup:test" });
await ok("member also has a pending Mentor invite to data-science", async () =>
  I.createSpaceInvite(await Acc.getSpaceAccess(pLead, "gdg-oau", "data-science"), "MENTOR", { email: "p1-member@example.test", sendEmail: false }),
);
await refuses("you can't remove yourself", () => C.removeCommunityMember(newLeadC, P.lead), /yourself/);
await ok("Lead removes the member", () => C.removeCommunityMember(newLeadC, P.member));
const left = await db.select().from(S.spaceMembers).where(and(eq(S.spaceMembers.communityId, prov.community.id), eq(S.spaceMembers.userId, P.member)));
check("gone from every space", left.length === 0);
check("can't open the community any more (404)", (await statusOf(Acc.getCommunityAccess(pMember, "gdg-oau"))) === 404);
const stillPending = await db
  .select()
  .from(S.invites)
  .where(and(eq(S.invites.communityId, prov.community.id), eq(S.invites.email, "p1-member@example.test"), sql`${S.invites.revokedAt} is null`));
check("their pending invites are cancelled", stillPending.length === 0);
const invitedBack = (await ok("invited back", () => I.createCommunityInvite(newLeadC, "MEMBER", { email: "p1-member@example.test", sendEmail: false })))!;
await ok("member accepts again", () => I.redeemInvite(pMember, tokenOf(invitedBack.url)));
const kept = await db.select().from(S.pointsLedger).where(and(eq(S.pointsLedger.userId, P.member), eq(S.pointsLedger.communityId, prov.community.id)));
check("their history (points) is still there", kept.length === 1);

console.log("\nPeople management: resend an email invite");
await clearMail();
const toOther = (await ok("invite p1-other by email", () => I.createCommunityInvite(newLeadC, "MEMBER", { email: "p1-other@example.test" })))!;
const scope = { communityId: prov.community.id, spaceId: null };
const canInvite = (r: string) => Perm.community.invitableRoles(newLeadC.role).includes(r as never);
check("resend within 2 minutes is refused (429)", (await statusOf(I.resendInvite(pLead, scope, toOther.id, canInvite))) === 429);
await db.update(S.invites).set({ lastSentAt: new Date(Date.now() - 3 * 60_000) }).where(eq(S.invites.id, toOther.id));
const resent = (await ok("resend after the cooldown", () => I.resendInvite(pLead, scope, toOther.id, canInvite)))!;
check("a second email went out with a new link", resent.emailed && (await mailsTo("p1-other@example.test")).length === 2 && resent.url !== toOther.url);
const oldPv = await I.previewInvite(tokenOf(toOther.url));
check("the old link says invalid", !oldPv.ok && /isn't valid/.test(oldPv.reason));
await ok("the new link works", () => I.redeemInvite(pOther, tokenOf(resent.url)));
check("an accepted invite can't be resent (410)", (await statusOf(I.resendInvite(pLead, scope, toOther.id, canInvite))) === 410);
const shareable = await I.createCommunityInvite(newLeadC, "MEMBER", { maxUses: 5 });
check("only email invites can be resent (400)", (await statusOf(I.resendInvite(pLead, scope, shareable.id, canInvite))) === 400);

console.log("\nPeople management: deactivate");
await refuses("only a Super Admin deactivates", () => Adm.setUserActive(pLead, P.other, false), /permission/);
await refuses("not yourself", () => Adm.setUserActive(root, P.root, false), /yourself/);
await ok("Super Admin deactivates p1-other", () => Adm.setUserActive(root, P.other, false));
check("account marked deactivated", !!(await pu(P.other)).deactivatedAt);
await ok("reactivate", () => Adm.setUserActive(root, P.other, true));
check("account active again, memberships kept", !(await pu(P.other)).deactivatedAt && (await roleIn(P.other)) === "MEMBER");
await db.update(S.users).set({ globalRole: "SUPER_ADMIN" }).where(eq(S.users.id, P.mgr));
await refuses("a Super Admin can't be deactivated", () => Adm.setUserActive(root, P.mgr, false), /Super Admins/);
await db.update(S.users).set({ globalRole: "USER" }).where(eq(S.users.id, P.mgr));

console.log(`\n${pass} passed, ${failCount} failed`);
if (failures.length) console.log("FAILURES:\n- " + failures.join("\n- "));
process.exit(failCount ? 1 : 0);
