import { formatDistanceToNowStrict } from "date-fns";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";

export type ActivityItem = {
  id: number;
  actionType: string;
  entityType: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  actor: { id: string; name: string | null; email: string; avatarUrl: string | null; githubUsername: string | null } | null;
  community: { slug: string; name: string } | null;
  space: { slug: string; name: string } | null;
};

const TONE: Record<string, string> = {
  LOGIN: "bg-muted text-muted-foreground",
  PROVISION_COMMUNITY: "bg-ink text-ink-foreground",
  DELETE_COMMUNITY: "bg-destructive/10 text-destructive",
  SUSPEND_COMMUNITY: "bg-destructive/10 text-destructive",
  SUBMISSION_APPROVED: "bg-moss-soft text-moss",
  CHECKPOINT_PASSED: "bg-moss-soft text-moss",
  CHECK_IN: "bg-ember-soft text-accent-foreground",
  ROLE_CHANGED: "bg-sky-soft text-sky",
  GLOBAL_ROLE_CHANGED: "bg-sky-soft text-sky",
  INVITE_REDEEMED: "bg-moss-soft text-moss",
};

function describe(item: ActivityItem): string {
  const m = item.metadata ?? {};
  const role = typeof m.role === "string" ? m.role.toLowerCase() : null;
  switch (item.actionType) {
    case "LOGIN":
      return `signed in${m.provider ? ` with ${m.provider}` : ""}`;
    case "PROVISION_COMMUNITY":
      return `provisioned a community, owner ${m.ownerEmail ?? "pending"}`;
    case "INVITE_CREATED":
      return `created a ${role ?? ""} invite${m.email ? ` for ${m.email}` : " link"}`;
    case "INVITE_REDEEMED":
      return `joined as ${role ?? "member"}`;
    case "INVITE_REVOKED":
      return "revoked an invite";
    case "ROLE_CHANGED":
      return `changed a ${m.scope ?? ""} role ${String(m.from ?? "").toLowerCase()} → ${String(m.to ?? "").toLowerCase()}`;
    case "GLOBAL_ROLE_CHANGED":
      return `changed a global role ${String(m.from ?? "").toLowerCase()} → ${String(m.to ?? "").toLowerCase()}`;
    case "CREATE_SPACE":
      return `created the space ${m.slug ?? ""}`;
    case "MEMBER_JOINED":
      return "joined a space";
    case "MEMBER_REMOVED":
      return m.left ? "left a space" : "removed a member";
    case "DELETE_COMMUNITY":
      return `deleted ${m.name ?? "a community"}`;
    default:
      return item.actionType.toLowerCase().replace(/_/g, " ");
  }
}

export function ActivityList({ items, compact }: { items: ActivityItem[]; compact?: boolean }) {
  if (!items.length) {
    return <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">No activity matches.</p>;
  }
  return (
    <ol className="divide-y rounded-2xl border bg-card">
      {items.map((item) => (
        <li key={item.id} className={cn("flex items-start gap-3 px-4", compact ? "py-2.5" : "py-3")}>
          <UserAvatar name={item.actor?.name} email={item.actor?.email} src={item.actor?.avatarUrl} className="mt-0.5 size-7" />
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <span className="font-medium">{item.actor?.name ?? item.actor?.email ?? "System"}</span>{" "}
              <span className="text-muted-foreground">{describe(item)}</span>
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className={cn("rounded px-1.5 py-0.5 font-mono text-[10px]", TONE[item.actionType] ?? "bg-muted text-muted-foreground")}>
                {item.actionType}
              </span>
              {item.community ? (
                <span className="font-mono">
                  /c/{item.community.slug}
                  {item.space ? `/${item.space.slug}` : ""}
                </span>
              ) : null}
              <time dateTime={item.createdAt.toISOString()} title={item.createdAt.toISOString()}>
                {formatDistanceToNowStrict(item.createdAt, { addSuffix: true })}
              </time>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
