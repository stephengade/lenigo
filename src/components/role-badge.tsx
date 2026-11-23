import { cn } from "@/lib/utils";
import { ROLE_LABEL, type CommunityRole, type GlobalRole, type SpaceRole } from "@/lib/permissions";

const TONE: Record<string, string> = {
  SUPER_ADMIN: "bg-ink text-ink-foreground",
  ADMIN: "bg-sky-soft text-sky",
  VIEWER: "bg-secondary text-muted-foreground",
  USER: "bg-secondary text-muted-foreground",
  OWNER: "bg-ink text-ink-foreground",
  LEAD: "bg-ember text-white",
  MANAGER: "bg-ember-soft text-accent-foreground",
  MENTOR: "bg-moss-soft text-moss",
  MEMBER: "bg-secondary text-secondary-foreground",
};

export function RoleBadge({ role, className }: { role: GlobalRole | CommunityRole | SpaceRole; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 font-mono text-[10px] font-medium tracking-wide uppercase",
        TONE[role],
        className,
      )}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}
