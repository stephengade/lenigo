import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/server/env";
import * as schema from "./schema";

declare global {
  var __lenigoSql: ReturnType<typeof postgres> | undefined;
}

function createDb() {
  // Supabase's transaction pooler (port 6543) does not support prepared statements.
  const client =
    globalThis.__lenigoSql ??
    postgres(env.DATABASE_URL, { prepare: false, max: env.NODE_ENV === "production" ? 10 : 3 });
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
