import { ShieldAlert } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/button-link";

export const metadata = { title: "No access" };

export default async function DeniedPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  return (
    <main className="flex min-h-dvh flex-col p-6">
      <Logo />
      <div className="m-auto max-w-md text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-ember-soft text-accent-foreground">
          <ShieldAlert className="size-6" />
        </div>
        <h1 className="mt-5 text-2xl font-bold">You can&rsquo;t open that</h1>
        <p className="mt-2 text-sm text-muted-foreground">{reason?.slice(0, 200) || "Your role doesn't include access to this page."}</p>
        <ButtonLink href="/c" variant="outline" className="mt-6">
          Back to my communities
        </ButtonLink>
      </div>
    </main>
  );
}
