import { ComingSoon } from "@/components/coming-soon";
import { pageSpace } from "@/server/auth/guards";

export const metadata = { title: "Roadmap" };

export default async function Page({ params }: { params: Promise<{ community: string; space: string }> }) {
  const { community: c, space: s } = await params;
  await pageSpace(c, s);
  return (
    <ComingSoon
      title="Roadmap"
      phase={2}
      description="Pick a track and level, then work through modules in order."
      bullets={[
        "Track and level selector",
        "Module cards: locked, active, done",
        "Sequential unlocking by quiz + project",
        "Leads, managers and mentors bypass locks",
      ]}
    />
  );
}
