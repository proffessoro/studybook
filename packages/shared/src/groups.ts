import { z } from 'zod';
import { GroupRole } from './roles.js';

export const GroupRoleSchema = z.enum([GroupRole.LEADER, GroupRole.MODERATOR, GroupRole.MEMBER]);

const name = z.string().trim().min(3).max(80);
const description = z.string().trim().max(2000);
/** A free label such as "Français" or "English / Français". The interface still follows each user's language. */
const languageLabel = z.string().trim().max(40);

/** GRP-01. The cover image comes with file storage (step 1.4). */
export const CreateGroupInput = z
  .object({
    name,
    description: description.default(''),
    languageLabel: languageLabel.optional(),
  })
  .meta({ id: 'CreateGroupInput' });
export type CreateGroupInput = z.input<typeof CreateGroupInput>;

/** GRP-02. Only the fields sent change. */
export const UpdateGroupInput = z
  .object({
    name,
    description,
    /** `listed` puts the group in the catalogue (GRP-04) */
    visibility: z.enum(['private', 'listed']),
    /** People with the invite link need the leader's approval */
    inviteRequiresApproval: z.boolean(),
    /** `all` lets members see each other's points (TRK-04) */
    progressVisibility: z.enum(['own', 'all']),
    feedEnabled: z.boolean(),
    /** Empty to remove */
    languageLabel,
  })
  .partial()
  .meta({ id: 'UpdateGroupInput' });
export type UpdateGroupInput = z.input<typeof UpdateGroupInput>;

/** GRP-05: deleting needs the group's name typed again. */
export const DeleteGroupInput = z.object({ confirmName: z.string() }).meta({ id: 'DeleteGroupInput' });
export type DeleteGroupInput = z.input<typeof DeleteGroupInput>;

/** A group as one of its members sees it. */
export const GroupView = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    description: z.string(),
    visibility: z.enum(['private', 'listed']),
    inviteRequiresApproval: z.boolean(),
    progressVisibility: z.enum(['own', 'all']),
    feedEnabled: z.boolean(),
    languageLabel: z.string().nullable(),
    status: z.enum(['active', 'archived']),
    memberCount: z.number(),
    /** null = no limit */
    memberCap: z.number().nullable(),
    myRole: GroupRoleSchema,
    /** Only for the leader (LIM-01): e.g. "620 MB of 1 GB". quotaBytes null = no limit */
    storage: z.object({ usedBytes: z.number(), quotaBytes: z.number().nullable() }).nullable(),
    createdAt: z.string(),
  })
  .meta({ id: 'GroupView' });
export type GroupView = z.infer<typeof GroupView>;

/** One line of "My groups". */
export const MyGroup = z
  .object({
    id: z.string(),
    name: z.string(),
    status: z.enum(['active', 'archived']),
    myRole: GroupRoleSchema,
    memberCount: z.number(),
  })
  .meta({ id: 'MyGroup' });
export type MyGroup = z.infer<typeof MyGroup>;

export const MyGroups = z.object({ groups: z.array(MyGroup) }).meta({ id: 'MyGroups' });
export type MyGroups = z.infer<typeof MyGroups>;

/** The group's current invite link (GRP-03). */
export const InviteLinkView = z
  .object({ token: z.string(), createdAt: z.string() })
  .meta({ id: 'InviteLinkView' });
export type InviteLinkView = z.infer<typeof InviteLinkView>;

/**
 * What someone opening an invite link sees, logged in or not. `viewer` says
 * where they stand: null when logged out.
 */
export const InvitePreview = z
  .object({
    groupName: z.string(),
    description: z.string(),
    memberCount: z.number(),
    requiresApproval: z.boolean(),
    /** LIM-02: "This group is full" */
    full: z.boolean(),
    viewer: z.enum(['none', 'member', 'pending', 'banned']).nullable(),
    /** Set for members, to go straight to the group */
    groupId: z.string().nullable(),
  })
  .meta({ id: 'InvitePreview' });
export type InvitePreview = z.infer<typeof InvitePreview>;

/** `joined`: a member now. `requested`: waiting for the leader (MEM-04). */
export const JoinResult = z
  .object({ status: z.enum(['joined', 'requested']), groupId: z.string() })
  .meta({ id: 'JoinResult' });
export type JoinResult = z.infer<typeof JoinResult>;

/** A pending join request, as the leader sees it (MEM-01: the leader sees contacts). */
export const JoinRequestView = z
  .object({
    id: z.string(),
    source: z.enum(['catalogue', 'invite']),
    createdAt: z.string(),
    user: z.object({ pseudo: z.string(), fullName: z.string(), email: z.string(), phone: z.string().nullable() }),
  })
  .meta({ id: 'JoinRequestView' });
export type JoinRequestView = z.infer<typeof JoinRequestView>;

export const JoinRequestList = z.object({ requests: z.array(JoinRequestView) }).meta({ id: 'JoinRequestList' });
export type JoinRequestList = z.infer<typeof JoinRequestList>;

export const DecideJoinRequestInput = z
  .object({ decision: z.enum(['accept', 'reject']) })
  .meta({ id: 'DecideJoinRequestInput' });
export type DecideJoinRequestInput = z.input<typeof DecideJoinRequestInput>;

/**
 * A member as another member sees them (MEM-01): pseudo and role only.
 * `contact` is filled for the leader alone; the API never sends it to others (NFR-06).
 * The avatar comes with file storage (step 1.4).
 */
export const MemberView = z
  .object({
    userId: z.string(),
    pseudo: z.string(),
    role: GroupRoleSchema,
    contact: z
      .object({ fullName: z.string(), email: z.string(), phone: z.string().nullable(), joinedAt: z.string() })
      .nullable(),
  })
  .meta({ id: 'MemberView' });
export type MemberView = z.infer<typeof MemberView>;

export const MemberList = z.object({ members: z.array(MemberView) }).meta({ id: 'MemberList' });
export type MemberList = z.infer<typeof MemberList>;

/** MEM-02: promote to moderator or back to member. Leadership moves with `TransferLeadershipInput`. */
export const ChangeRoleInput = z.object({ role: z.enum(['moderator', 'member']) }).meta({ id: 'ChangeRoleInput' });
export type ChangeRoleInput = z.input<typeof ChangeRoleInput>;

export const TransferLeadershipInput = z.object({ userId: z.string() }).meta({ id: 'TransferLeadershipInput' });
export type TransferLeadershipInput = z.input<typeof TransferLeadershipInput>;

/** MEM-03: `ban` also stops them from coming back by link or request. */
export const RemoveMemberInput = z.object({ ban: z.boolean().default(false) }).meta({ id: 'RemoveMemberInput' });
export type RemoveMemberInput = z.input<typeof RemoveMemberInput>;
