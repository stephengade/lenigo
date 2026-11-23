import Link from "next/link";
import { cn } from "@/lib/utils";

/** The Lenigo mark: three rising steps — Beginner → Intermediate → Advanced — with an ember spark on top. */
export function LogoMark({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)}>
      <rect width="32" height="32" rx="9" className={inverted ? "fill-primary-foreground" : "fill-primary"} />
      <path d="M8 23h5v-4h5v-4h5v8H8z" className={inverted ? "fill-primary" : "fill-primary-foreground"} />
      <circle cx="23" cy="10" r="2.6" className="fill-ember" />
    </svg>
  );
}

export function Logo({ href = "/", className, tone }: { href?: string; className?: string; tone?: "light" }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)}>
      <LogoMark inverted={tone === "light"} />
      <span className={cn("font-display text-lg font-bold tracking-tight", tone === "light" && "text-primary-foreground")}>lenigo</span>
    </Link>
  );
}
