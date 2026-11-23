import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export function ComingSoon({
  title,
  phase,
  description,
  bullets,
}: {
  title: string;
  phase: number;
  description: string;
  bullets: string[];
}) {
  return (
    <div>
      <PageHeader eyebrow={`Phase ${phase}`} title={title} description={description} />
      <div className="rounded-2xl border border-dashed bg-card/50 p-6">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="size-4 text-ember" /> On the way
        </div>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {bullets.map((b) => (
            <li key={b} className="rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground">
              {b}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
