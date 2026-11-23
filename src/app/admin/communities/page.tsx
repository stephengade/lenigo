import { Building2, Plus } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/button-link";
import { HealthTable } from "@/components/admin/health-table";
import { pageGlobalHouse } from "@/server/auth/guards";
import { listCommunityHealth } from "@/server/services/communities";
import { global } from "@/lib/permissions";

export const metadata = { title: "Communities" };

export default async function AdminCommunitiesPage() {
  const user = await pageGlobalHouse();
  const rows = await listCommunityHealth();
  const canProvision = global.canProvision(user.globalRole);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Global House"
        title="Communities"
        description="Each community gets its own portal at /c/<slug> with spaces for each track it runs."
        actions={
          canProvision ? (
            <ButtonLink href="/admin/communities/new">
              <Plus /> Provision community
            </ButtonLink>
          ) : null
        }
      />
      {rows.length ? (
        <HealthTable rows={rows} />
      ) : (
        <EmptyState
          icon={<Building2 />}
          title="No communities yet"
          action={canProvision ? <ButtonLink href="/admin/communities/new">Provision the first one</ButtonLink> : null}
        >
          Start with a campus community like GDG OAU, give it spaces like Web Development and Data Science, and assign its owner.
        </EmptyState>
      )}
    </div>
  );
}
