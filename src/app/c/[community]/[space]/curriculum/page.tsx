import Link from "next/link";
import { ArrowRight, LibraryBig, Lock } from "lucide-react";
import { EmptyState, PageHeader, Panel } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { CreateTrackDialog, MoveButtons } from "@/components/curriculum/editor";
import { pageSpaceRole } from "@/server/auth/guards";
import { listTracks } from "@/server/services/curriculum";
import { LEVEL_LABEL, space as rules } from "@/lib/permissions";

export const metadata = { title: "Curriculum" };

export default async function CurriculumPage({ params }: { params: Promise<{ community: string; space: string }> }) {
  const { community: c, space: s } = await params;
  const access = await pageSpaceRole(c, s, rules.canEditCurriculum);
  const tracks = await listTracks(access.space.id);

  return (
    <div>
      <PageHeader
        eyebrow="Curriculum"
        title="Tracks"
        description="Each track has three levels that you name. Learners pick one track to start; a mentor adds them to others."
        actions={<CreateTrackDialog c={c} s={s} />}
      />
      {tracks.length === 0 ? (
        <EmptyState icon={<LibraryBig />} title="No tracks yet" action={<CreateTrackDialog c={c} s={s} />}>
          Start with the path most of your learners need first. You can add more tracks any time.
        </EmptyState>
      ) : (
        <Panel>
          <ul className="grid gap-3">
            {tracks.map((t, i) => (
              <li key={t.id} className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-card">
                <MoveButtons c={c} s={s} kind="track" id={t.id} first={i === 0} last={i === tracks.length - 1} />
                <Link href={`/c/${c}/${s}/curriculum/${t.id}`} className="group flex min-w-0 flex-1 items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-lg font-bold">{t.title}</h2>
                      <Badge variant={t.isPublished ? "mint" : "muted"}>{t.isPublished ? "Published" : "Draft"}</Badge>
                      {t.placementTaskMd ? <Badge variant="lilac">Placement test</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {t.publishedModules}/{t.modules} modules published · {t.learners} {t.learners === 1 ? "learner" : "learners"}
                      {t.prerequisite ? (
                        <span className="ml-2 inline-flex items-center gap-1">
                          <Lock className="size-3" /> needs {t.prerequisite.title} {LEVEL_LABEL[t.prerequisiteTier ?? "INTERMEDIATE"]}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
