import { ComingSoon } from "@/components/coming-soon";
import { pageSpaceRole } from "@/server/auth/guards";
import { space as rules } from "@/lib/permissions";

export const metadata = { title: "Review queue" };

export default async function Page({ params }: { params: Promise<{ community: string; space: string }> }) {
  const { community: c, space: s } = await params;
  await pageSpaceRole(c, s, rules.canReview);
  return (
    <ComingSoon
      title="Review queue"
      phase={3}
      description="Pending project submissions waiting for a mentor."
      bullets={[
        "Open repo and live links side by side",
        "Approve (+100 pts) or request revision",
        "Written feedback the learner sees",
        "Turnaround time tracking",
      ]}
    />
  );
}
