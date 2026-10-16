import { describe, expect, it } from 'vitest';
import { can, permissions } from './permissions.js';

describe('permission matrix', () => {
  it('keeps contacts, proof, the dashboard, and member management to the leader (requirements §2)', () => {
    for (const action of ['member.contacts.view', 'submission.view_any', 'dashboard.view', 'member.manage'] as const) {
      expect(can('leader', action)).toBe(true);
      expect(can('moderator', action)).toBe(false);
      expect(can('member', action)).toBe(false);
    }
  });

  it('lets moderators create content and moderate, but not members', () => {
    for (const action of ['content.manage', 'task.manage', 'feed.moderate'] as const) {
      expect(can('moderator', action)).toBe(true);
      expect(can('member', action)).toBe(false);
    }
  });

  it('gives the leader every permission', () => {
    for (const action of Object.keys(permissions) as (keyof typeof permissions)[]) {
      expect(can('leader', action)).toBe(true);
    }
  });
});
