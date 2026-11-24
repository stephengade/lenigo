import { cn } from "@/lib/utils";
import { ROLE_LABEL, type CommunityRole, type GlobalRole, type SpaceRole } from "@/lib/permissions";

const TONE: Record<string, string> = {
  SUPER_ADMIN: "bg-ink text-ink-foreground",
  ADMIN: "bg-lilac-soft text-lilac-foreground",
  VIEWER: "bg-surface text-muted-foreground",
  USER: "bg-surface text-muted-foreground",
  OWNER: "bg-ink text-ink-foreground",
  LEAD: "bg-primary text-primary-foreground",
  MANAGER: "bg-lilac-soft text-lilac-foreground",
  MENTOR: "bg-mint-soft text-mint-foreground",
  MEMBER: "bg-surface text-muted-foreground",
};

export function RoleBadge({ role, className }: { role: GlobalRole | CommunityRole | SpaceRole; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-semibold", TONE[role], className)}>
      {ROLE_LABEL[role]}
    </span>
  );
}
