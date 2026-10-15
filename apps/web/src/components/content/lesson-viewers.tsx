import { getFormatter, getTranslations } from 'next-intl/server';
import { EyeIcon } from 'lucide-react';
import type { LessonViewers as Viewers } from '@studybook/shared';

/** CNT-03, for the leader: who opened the lesson, and when. Folded by default; needs no JavaScript. */
export async function LessonViewers({ viewers }: { viewers: Viewers }) {
  const t = await getTranslations('LessonViews');
  const format = await getFormatter();

  return (
    <details className="rounded-lg border p-3">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <EyeIcon className="size-4" aria-hidden />
        {t('summary', { viewed: viewers.viewedCount, total: viewers.memberCount })}
      </summary>
      {viewers.memberCount === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t('noMembers')}</p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y text-sm">
          {viewers.members.map((m) => (
            <li key={m.userId} className="flex flex-wrap justify-between gap-x-4 py-1.5">
              <span className="break-all">{m.pseudo}</span>
              <span className="text-muted-foreground">
                {m.firstViewedAt ? format.dateTime(new Date(m.firstViewedAt), { dateStyle: 'medium', timeStyle: 'short' }) : t('notYet')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
