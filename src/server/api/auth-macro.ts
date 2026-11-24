import "server-only";
import { Elysia } from "elysia";
import { getSessionUser } from "@/server/auth/session";
import { fail } from "@/server/auth/access";

/** `{ auth: true }` on a route resolves the signed-in user from the Supabase session cookie, or 401s. */
export const authMacro = new Elysia({ name: "lenigo-auth" }).macro({
  auth: {
    async resolve() {
      const user = await getSessionUser();
      if (!user) throw fail.unauthorized();
      return { user };
    },
  },
});
