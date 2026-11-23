import { ComingSoon } from "@/components/coming-soon";
import { pageSpace } from "@/server/auth/guards";

export const metadata = { title: "Leaderboard" };

export default async function Page({ params }: { params: Promise<{ community: string; space: string }> }) {
  const { community: c, space: s } = await params;
  await pageSpace(c, s);
  return (
    <ComingSoon
      title="Leaderboard"
      phase={3}
      description="Rankings built from the append-only points ledger."
      bullets={[
        "This week, this month, all-time",
        "Filter by track",
        "Streak flames and level badges",
        "Updates the moment points are awarded",
      ]}
    />
  );
}
