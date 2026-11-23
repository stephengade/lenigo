import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/button-link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col p-6">
      <Logo />
      <div className="m-auto max-w-md text-center">
        <p className="font-display text-7xl font-extrabold text-ember">404</p>
        <h1 className="mt-3 text-2xl font-bold">Nothing here</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page doesn&rsquo;t exist, or you&rsquo;re not a member of the community it belongs to.
        </p>
        <ButtonLink href="/c" variant="outline" className="mt-6">
          Back to my communities
        </ButtonLink>
      </div>
    </main>
  );
}
