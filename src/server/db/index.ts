import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/server/env";
import * as schema from "./schema";

declare global {
  var __lenigoSql: ReturnType<typeof postgres> | undefined;
}

function createDb() {
  // Supabase's transaction pooler (port 6543):
  // - prepare: false, because it does not support prepared statements.
  // - max_pipeline: 1, because it hangs when a second query is pipelined onto a busy connection
  //   (seen 2026-11-24: any page running more queries at once than `max` froze until the
  //   statement timeout). With 1, extra queries wait for a free connection instead.
  // - queue_timeout/query_timeout so a stuck query fails in seconds instead of freezing a page.
  const client =
    globalThis.__lenigoSql ??
    postgres(env.DATABASE_URL, {
      prepare: false,
      max: env.NODE_ENV === "production" ? 10 : 3,
      max_pipeline: 1,
      queue_timeout: 20,
      query_timeout: 30,
    });
  if (env.NODE_ENV !== "production") globalThis.__lenigoSql = client;
  return drizzle(client, { schema });
}

export type DB = ReturnType<typeof createDb>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

let instance: DB | undefined;

/** Created on first use, so importing this module never needs DATABASE_URL (keeps builds secret-free). */
export const db = new Proxy({} as DB, {
  get(_, key) {
    instance ??= createDb();
    const value = Reflect.get(instance, key);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export { schema };
