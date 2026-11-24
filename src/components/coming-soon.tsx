import { Sparkles } from "lucide-react";
import { PageHeader, Panel } from "@/components/page-header";

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
      <PageHeader eyebrow={`Coming in phase ${phase}`} title={title} description={description} />
      <Panel>
        <div className="rounded-2xl bg-card p-5 shadow-card">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="grid size-8 place-items-center rounded-xl bg-sun-soft text-sun-foreground">
              <Sparkles className="size-4" />
            </span>
            On the way
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {bullets.map((b) => (
              <li key={b} className="rounded-xl bg-surface px-4 py-3 text-sm text-muted-foreground">
                {b}
              </li>
            ))}
          </ul>
        </div>
      </Panel>
    </div>
  );
}
