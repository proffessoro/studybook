'use client';

import { useEffect } from 'react';
import { api } from '@/lib/api';

/**
 * Tells the API this person opened the lesson (CNT-03). It runs in the browser
 * after the page shows, not while the server renders it, so a prefetched link
 * never counts as a visit. Only the first visit is kept, so repeats are harmless.
 */
export function LessonViewRecorder({ groupId, lessonId }: { groupId: string; lessonId: string }) {
  useEffect(() => {
    void api.POST('/api/v1/groups/{groupId}/lessons/{lessonId}/view', { params: { path: { groupId, lessonId } } }).catch(() => undefined);
  }, [groupId, lessonId]);
  return null;
}
