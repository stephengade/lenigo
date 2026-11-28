import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Lock } from "lucide-react";
import { PageHeader, Panel } from "@/components/page-header";
import { ButtonLink } from "@/components/button-link";
import { resumeStep } from "@/lib/module-steps";
import { loadModule, type ModuleParams } from "./load";

export const metadata = { title: "Module" };

/** Opening a module picks up where the learner left off: the first step that isn't done yet. */
export default async function ModulePage({ params }: { params: ModuleParams }) {
  const { w, base, moduleBase, steps } = await loadModule(params);

  if (!w.locked) redirect(`${moduleBase}/${resumeStep(steps).path}`);

  return (
    <div className="max-w-2xl">
      <Link href={`${base}/roadmap`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Roadmap
      </Link>
      <PageHeader title={w.module.title} />
      <Panel>
        <div className="flex items-start gap-3 rounded-2xl bg-card p-5 shadow-card">
          <Lock className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div>
            <h2 className="font-display text-lg font-bold">Not yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">Modules open one at a time. {w.lockedBy ? `Finish "${w.lockedBy}" first.` : "Finish the module before this one first."}</p>
            <ButtonLink href={`${base}/roadmap`} className="mt-4" size="sm">
              Back to your roadmap
            </ButtonLink>
          </div>
        </div>
      </Panel>
    </div>
  );
}
