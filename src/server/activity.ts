import "server-only";
import { db, type Tx } from "@/server/db";
import { activityLogs } from "@/server/db/schema";

/** Every action type written to the audit trail. Add new ones here so filters stay in sync. */
export const ACTION_TYPES = [
  "LOGIN",
  "PROVISION_COMMUNITY",
  "UPDATE_COMMUNITY",
  "SUSPEND_COMMUNITY",
  "REACTIVATE_COMMUNITY",
  "DELETE_COMMUNITY",
  "CREATE_SPACE",
  "UPDATE_SPACE",
  "ARCHIVE_SPACE",
  "INVITE_CREATED",
  "INVITE_REVOKED",
  "INVITE_REDEEMED",
  "INVITE_RESENT",
  "MEMBER_JOINED",
  "MEMBER_REMOVED",
  "ROLE_CHANGED",
  "GLOBAL_ROLE_CHANGED",
  "LEAD_HANDED_OVER",
  "USER_DEACTIVATED",
  "USER_REACTIVATED",
  "SUBMISSION_CREATED",
  "SUBMISSION_APPROVED",
  "SUBMISSION_NEEDS_REVISION",
  "CHECKPOINT_PASSED",
  "LEVEL_PROMOTED",
  "ATTENDANCE_MARKED",
  "CHECK_IN",
  "CURRICULUM_CHANGED",
  "TRACK_ENROLLED",
  "BRANCH_CHOSEN",
  "PLACEMENT_SUBMITTED",
  "PLACEMENT_REVIEWED",
  "WORKSHOP_CREATED",
  "WORKSHOP_CANCELLED",
  "PROFILE_UPDATED",
  "COMMUNITY_REQUESTED",
  "COMMUNITY_REQUEST_UPDATED",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export type ActivityInput = {
  actorUserId: string | null;
  actionType: ActionType;
  communityId?: string | null;
  spaceId?: string | null;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

/** Append an immutable audit entry. Pass the transaction so the log commits with the change it describes. */
export async function logActivity(input: ActivityInput, tx: Tx | typeof db = db) {
  await tx.insert(activityLogs).values({
    actorUserId: input.actorUserId,
    actionType: input.actionType,
    communityId: input.communityId ?? null,
    spaceId: input.spaceId ?? null,
    entityType: input.entityType,
    entityId: input.entityId,
    metadata: input.metadata ?? {},
  });
}
