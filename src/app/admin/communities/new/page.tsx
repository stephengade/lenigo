import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/button-link";
import { ProvisionForm } from "@/components/admin/provision-form";
import { pageGlobalHouse } from "@/server/auth/guards";
import { global } from "@/lib/permissions";

export const metadata = { title: "Provision community" };

export default async function NewCommunityPage() {
  const user = await pageGlobalHouse();
  if (!global.canProvision(user.globalRole)) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <ButtonLink href="/admin/communities" variant="ghost" size="sm" className="mb-4 -ml-2">
        <ChevronLeft /> Communities
      </ButtonLink>
      <PageHeader
        eyebrow="FR-1.1"
        title="Provision a community"
        description="Creates the community and its spaces, makes the person you name its Community Lead, and emails them the invite."
      />
      <ProvisionForm />
    </div>
  );
}
