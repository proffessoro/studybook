export const GroupRole = {
  LEADER: 'leader',
  MODERATOR: 'moderator',
  MEMBER: 'member',
} as const;

export type GroupRole = (typeof GroupRole)[keyof typeof GroupRole];
