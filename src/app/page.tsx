import { Landing } from "@/components/landing/landing";
import { getSessionUser } from "@/server/auth/session";

/** Public home page. Signed-in visitors get "Go to your communities" instead of the invite CTA. */
export default async function Home() {
  const user = await getSessionUser();
  return <Landing signedIn={!!user} />;
}
