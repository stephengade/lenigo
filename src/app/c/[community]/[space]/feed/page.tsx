import { ComingSoon } from "@/components/coming-soon";
import { pageSpace } from "@/server/auth/guards";

export const metadata = { title: "Community feed" };

export default async function Page({ params }: { params: Promise<{ community: string; space: string }> }) {
  const { community: c, space: s } = await params;
  await pageSpace(c, s);
  return (
    <ComingSoon
      title="Community feed"
      phase={3}
      description="Standups, passed quizzes and shipped projects from everyone in this space."
      bullets={[
        "Chronological activity stream",
        "Reactions: fire, rocket, idea",
        "Comments to unblock learners",
        "HELP NEEDED badges for mentors",
      ]}
    />
  );
}
