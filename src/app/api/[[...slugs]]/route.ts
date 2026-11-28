import { app } from "@/server/api/app";

export const dynamic = "force-dynamic";

const WRITES = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Cross-site request forgery guard, on top of the SameSite=Lax session cookie: a browser always
 * sends Origin on these methods, so a write from another site (or a sibling subdomain, which
 * SameSite would let through) is refused. Requests without Origin aren't from a browser page
 * and can't carry the user's cookies by themselves.
 */
function fromThisSite(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const own = [new URL(request.url).host, request.headers.get("x-forwarded-host"), request.headers.get("host")];
  return own.some((h) => h && h.split(",")[0].trim() === host);
}

const handle = (request: Request) => {
  if (WRITES.has(request.method) && !fromThisSite(request)) {
    return new Response(JSON.stringify({ error: "Cross-site request refused." }), { status: 403, headers: { "content-type": "application/json" } });
  }
  return app.handle(request);
};
export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
