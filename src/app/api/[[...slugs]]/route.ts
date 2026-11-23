import { app } from "@/server/api/app";

export const dynamic = "force-dynamic";

const handle = (request: Request) => app.handle(request);
export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
