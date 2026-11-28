import { LibraryBig } from "lucide-react";
import { EmptyState, PageHeader, Panel } from "@/components/page-header";
import { Section } from "@/components/form-field";
import { OnboardingForm } from "@/components/learn/onboarding-form";
import { pageSpaceRole } from "@/server/auth/guards";
import { listTracks } from "@/server/services/curriculum";
import { getIntake, getMyEnrollments, trackStacks } from "@/server/services/learning";
import { LEVEL_LABEL } from "@/lib/permissions";

export const metadata = { title: "Get started" };

export default async function OnboardingPage({ params }: { params: Promise<{ community: string; space: string }> }) {
  const { community: c, space: s } = await params;
  const access = await pageSpaceRole(c, s, () => true);
  const [tracks, intake, mine] = await Promise.all([listTracks(access.space.id, { publishedOnly: true }), getIntake(access.space.id, access.user.id), getMyEnrollments(access.space.id, access.user.id)]);
  const stacks = await trackStacks(tracks.map((t) => t.id));

  return (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow={`Welcome to ${access.space.name}`}
        title="Let's get you started"
        description="Four quick questions. They pick your starting track and help your mentor get to know you. Everyone starts at the first level; if you already know the basics, you can take the placement test afterwards."
      />
      {tracks.length === 0 ? (
        <EmptyState icon={<LibraryBig />} title="No tracks are open yet">
          The team is still building the curriculum. Check back soon.
        </EmptyState>
      ) : (
        <Panel tone="sage">
          <Section>
            <OnboardingForm
              c={c}
              s={s}
              tracks={tracks.map((t) => ({
                id: t.id,
                title: t.title,
                description: t.description,
                locked: t.prerequisite ? `Needs ${t.prerequisite.title} ${LEVEL_LABEL[t.prerequisiteTier ?? "INTERMEDIATE"]} first` : null,
                stacks: stacks.get(t.id) ?? [],
              }))}
              initial={intake ? { goalTrackId: intake.goalTrackId, experience: intake.experience, links: intake.links, hoursPerWeek: intake.hoursPerWeek } : null}
              enrolledTrackId={mine[0]?.enrollment.trackId ?? null}
            />
          </Section>
        </Panel>
      )}
    </div>
  );
}
