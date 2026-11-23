import { ComingSoon } from "@/components/coming-soon";
import { pageSpace } from "@/server/auth/guards";

export const metadata = { title: "Workshops" };

export default async function Page({ params }: { params: Promise<{ community: string; space: string }> }) {
  const { community: c, space: s } = await params;
  await pageSpace(c, s);
  return (
    <ComingSoon
      title="Workshops"
      phase={4}
      description="Online calls and physical meetups, with a live review queue."
      bullets={[
        "Schedule online calls or physical meetups",
        "RSVP and attach a project for live review",
        "Mentor console with ordered queue",
        "Attendance awards +50 pts",
      ]}
    />
  );
}
