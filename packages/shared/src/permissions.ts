import { GroupRole } from './roles.js';

const { LEADER, MODERATOR, MEMBER } = GroupRole;
const everyone = [LEADER, MODERATOR, MEMBER] as const;

/**
 * Who may do what inside a group (design §5.4, roles in requirements §2).
 * One guard in the API enforces it, and the tests go through every role, so a
 * leak breaks the build. `writes` actions are refused while the group is archived.
 */
export const permissions = {
  'group.view': { roles: everyone, writes: false },
  'group.update': { roles: [LEADER], writes: true },
  'group.archive': { roles: [LEADER], writes: false },
  'group.delete': { roles: [LEADER], writes: false },
  'group.storage.view': { roles: [LEADER], writes: false },
  'member.list': { roles: everyone, writes: false },
  'member.contacts.view': { roles: [LEADER], writes: false },
  'member.manage': { roles: [LEADER], writes: true },
  'invite.manage': { roles: [LEADER], writes: true },
  'joinRequest.manage': { roles: [LEADER], writes: true },
  'content.manage': { roles: [LEADER, MODERATOR], writes: true },
  'task.manage': { roles: [LEADER, MODERATOR], writes: true },
  'submission.view_any': { roles: [LEADER], writes: false },
  'dashboard.view': { roles: [LEADER], writes: false },
  'feed.post': { roles: everyone, writes: true },
  'feed.moderate': { roles: [LEADER, MODERATOR], writes: true },
} as const satisfies Record<string, { roles: readonly GroupRole[]; writes: boolean }>;

export type GroupAction = keyof typeof permissions;

export function can(role: GroupRole, action: GroupAction): boolean {
  return (permissions[action].roles as readonly GroupRole[]).includes(role);
}
