import Link from "next/link";
import { Check, ChevronLeft, ExternalLink, FileText, PlayCircle, X } from "lucide-react";
import { PageHeader, Panel } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/form-field";
import { Markdown } from "@/components/markdown";
import { AddCheckpointForm, AddResourceForm, DeleteButton, ModuleDetailsForm, MoveButtons, PublishToggle, QuestionForm } from "@/components/curriculum/editor";
import { guard, pageSpaceRole } from "@/server/auth/guards";
import { getModuleEditor } from "@/server/services/curriculum";
import { space as rules } from "@/lib/permissions";
import { formatMinutes } from "@/lib/dates";
import { trackingFor } from "@/lib/video";
import { cn } from "@/lib/utils";

export const metadata = { title: "Edit module" };

const PROVIDER = { YOUTUBE: "YouTube", GOOGLE_DRIVE: "Google Drive", EXTERNAL: "External link" } as const;

export default async function ModuleEditorPage({ params }: { params: Promise<{ community: string; space: string; moduleId: string }> }) {
  const { community: c, space: s, moduleId } = await params;
  const access = await pageSpaceRole(c, s, rules.canEditCurriculum);
  const data = await guard(() => getModuleEditor(access, moduleId));
  const { module: mod, level, track, branches, resources, checkpoints } = data;
  const base = `/c/${c}/${s}`;
  const videos = resources.filter((r) => r.type === "VIDEO");

  const checklist = [
    { ok: !!mod.projectBriefMd, label: "Capstone project brief" },
    { ok: checkpoints.length > 0, label: "At least one checkpoint" },
    { ok: checkpoints.length > 0 && checkpoints.every((cp) => cp.questions.length > 0), label: "Every checkpoint has questions" },
    { ok: videos.length > 0, label: "At least one video lesson (recommended)" },
  ];

  return (
    <div className="space-y-6">
      <Link href={`${base}/curriculum/${track.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> {track.title} · {level.title}
      </Link>
      <PageHeader
        eyebrow={mod.isPublished ? "Published module" : "Draft module"}
        title={mod.title}
        actions={
          <>
            <PublishToggle c={c} s={s} kind="module" id={mod.id} published={mod.isPublished} />
            <DeleteButton c={c} s={s} kind="module" id={mod.id} label={`"${mod.title}"`} redirectTo={`${base}/curriculum/${track.id}`} />
          </>
        }
        className="pb-2"
      />

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_18rem]">
        <div className="space-y-6">
          <Panel>
            <Section title="Details">
              <ModuleDetailsForm c={c} s={s} module={mod} branches={branches} hasProgress={data.hasProgress} />
            </Section>
          </Panel>

          <Panel tone="lilac">
            <Section title="Lessons" description="Learners watch videos in order. Watch time is credited by the server; skipping ahead doesn't count.">
              <ul className="mb-4 grid gap-2">
                {resources.map((r, i) => (
                  <li key={r.id} className="flex items-center gap-2 rounded-xl bg-surface px-2 py-2.5">
                    <MoveButtons c={c} s={s} kind="resource" id={r.id} first={i === 0} last={i === resources.length - 1} />
                    {r.type === "VIDEO" ? <PlayCircle className="size-4 shrink-0 text-primary" /> : <FileText className="size-4 shrink-0 text-muted-foreground" />}
                    <div className="min-w-0 flex-1">
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 truncate text-sm font-medium hover:underline">
                        <span className="truncate">{r.title}</span> <ExternalLink className="size-3 shrink-0" />
                      </a>
                      <div className="text-xs text-muted-foreground">
                        {r.type === "VIDEO" && r.provider ? (
                          <>
                            {PROVIDER[r.provider]} · {formatMinutes(r.durationSeconds)}
                            {trackingFor(r.provider) === "none" ? " · not tracked" : trackingFor(r.provider) === "time-on-page" ? " · time on page" : ""}
                          </>
                        ) : (
                          <>Learn more{r.estMinutes ? ` · ${r.estMinutes} min read` : ""}</>
                        )}
                        {r.sourceName ? ` · ${r.sourceName}` : ""}
                      </div>
                    </div>
                    <DeleteButton c={c} s={s} kind="resource" id={r.id} label={`"${r.title}"`} />
                  </li>
                ))}
              </ul>
              <AddResourceForm c={c} s={s} moduleId={mod.id} />
            </Section>
          </Panel>

          <Panel tone="sun">
            <Section title="Checkpoints" description="Short assessments between lessons. Learners must pass each one; answers are graded on the server.">
              <div className="mb-4 grid gap-4">
                {checkpoints.map((cp) => (
                  <div key={cp.id} className="rounded-2xl border border-border p-4">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-display font-bold">{cp.title}</h3>
                        <p className="text-xs text-muted-foreground">
                          Pass mark {cp.passThreshold}% · opens {cp.afterResourceId ? `after "${resources.find((r) => r.id === cp.afterResourceId)?.title ?? "a lesson"}"` : "straight away"}
                        </p>
                      </div>
                      <DeleteButton c={c} s={s} kind="checkpoint" id={cp.id} label={`the "${cp.title}" checkpoint`} />
                    </div>
                    <ol className="mb-3 grid gap-2">
                      {cp.questions.map((q, i) => (
                        <li key={q.id} className="rounded-xl bg-surface p-3 text-sm">
                          <div className="flex items-start gap-2">
                            <span className="font-semibold text-muted-foreground">{i + 1}.</span>
                            <p className="flex-1 font-medium">{q.prompt}</p>
                            <DeleteButton c={c} s={s} kind="question" id={q.id} label="this question" />
                          </div>
                          {q.codeSnippet ? <pre className="mt-2 overflow-x-auto rounded-lg bg-ink p-3 font-mono text-xs text-ink-foreground">{q.codeSnippet}</pre> : null}
                          <ul className="mt-2 grid gap-1 pl-5">
                            {q.options.map((o, j) => (
                              <li key={j} className={cn("flex items-center gap-1.5", j === q.correctOptionIndex ? "font-medium text-mint-foreground" : "text-muted-foreground")}>
                                {j === q.correctOptionIndex ? <Check className="size-3.5" /> : <span className="size-3.5" />} {o}
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ol>
                    <QuestionForm c={c} s={s} target={{ kind: "checkpoint", id: cp.id }} />
                  </div>
                ))}
              </div>
              <AddCheckpointForm c={c} s={s} moduleId={mod.id} videos={videos.map((v) => ({ id: v.id, title: v.title }))} />
            </Section>
          </Panel>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24">
          <Panel>
            <Section title="Ready to publish?">
              <ul className="grid gap-2 text-sm">
                {checklist.map((i) => (
                  <li key={i.label} className="flex items-center gap-2">
                    {i.ok ? <Check className="size-4 text-mint" strokeWidth={3} /> : <X className="size-4 text-muted-foreground" />}
                    <span className={i.ok ? "" : "text-muted-foreground"}>{i.label}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">Learners complete a module by watching every video, passing every checkpoint and getting the capstone approved by a mentor.</p>
              <div className="mt-3">
                <Badge variant={mod.isPublished ? "mint" : "muted"}>{mod.isPublished ? "Live for learners" : "Hidden from learners"}</Badge>
              </div>
            </Section>
          </Panel>
          {mod.projectBriefMd ? (
            <Panel>
              <Section title="Brief preview">
                <Markdown source={mod.projectBriefMd} />
              </Section>
            </Panel>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
