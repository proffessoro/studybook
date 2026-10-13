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
