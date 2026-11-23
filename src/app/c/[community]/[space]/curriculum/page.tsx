import { ComingSoon } from "@/components/coming-soon";
import { pageSpaceRole } from "@/server/auth/guards";
import { space as rules } from "@/lib/permissions";

export const metadata = { title: "Curriculum builder" };

export default async function Page({ params }: { params: Promise<{ community: string; space: string }> }) {
  const { community: c, space: s } = await params;
  await pageSpaceRole(c, s, rules.canEditCurriculum);
  return (
    <ComingSoon
      title="Curriculum builder"
      phase={2}
      description="Build tracks, levels, modules, resources and quizzes."
      bullets={[
        "Draft and publish tracks, levels, modules",
        "Reorder videos, articles and starter repos",
        "Markdown action items",
        "Quiz builder with answer keys and thresholds",
      ]}
    />
  );
}
