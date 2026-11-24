// Fails a production build when the database is missing migrations from drizzle/.
//
// Why: Vercel goes live the moment a build passes. If the new code expects a column the
// database doesn't have yet, every signed-in page errors ("column ... does not exist").
// Failing the build keeps the previous deployment live until `pnpm db:migrate` has run.
//
// Runs only for Vercel production builds (or with --always, as `pnpm db:status` does).
// Read-only: one SELECT. Never prints the connection string.
import { readFileSync } from "node:fs";
import postgres from "postgres";

const always = process.argv.includes("--always");
if (!always && process.env.VERCEL_ENV !== "production") process.exit(0);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✖ DATABASE_URL isn't set, so the migration check can't run. Add it to the production environment.");
  process.exit(1);
}

const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8").replace(/^﻿/, ""));
const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 15 });
let applied;
try {
  const rows = await sql`select created_at from drizzle.__drizzle_migrations`;
  applied = new Set(rows.map((r) => String(r.created_at)));
} catch (e) {
  const missingTable = /__drizzle_migrations|schema "drizzle"/.test(String(e?.message));
  console.error(missingTable ? "✖ No migrations have been applied to this database. Run `pnpm db:migrate` first." : `✖ Couldn't check migrations: ${e?.code ?? e?.message ?? e}`);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}

const pending = journal.entries.filter((m) => !applied.has(String(m.when))).map((m) => m.tag);
if (pending.length) {
  console.error(`✖ The database is missing ${pending.length} migration(s): ${pending.join(", ")}`);
  console.error("  Run `pnpm db:migrate` against this database, then redeploy. The previous deployment stays live meanwhile.");
  process.exit(1);
}
console.log(`✓ Database has all ${journal.entries.length} migrations.`);
