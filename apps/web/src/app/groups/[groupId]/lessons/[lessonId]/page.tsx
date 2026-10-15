import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon, ArrowRightIcon, PencilIcon } from 'lucide-react';
import { LessonAttachments } from '@/components/content/lesson-attachments';
import { LessonViewRecorder } from '@/components/content/lesson-view-recorder';
import { LessonViewers } from '@/components/content/lesson-viewers';
import { RichTextView } from '@/components/content/rich-text-view';
import { Button } from '@/components/ui/button';
import { getGroup, getLesson, getLessonViewers, getMe } from '@/lib/server-api';

type Props = { params: Promise<{ groupId: string; lessonId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { groupId, lessonId } = await params;
  const lesson = await getLesson(groupId, lessonId);
  return { title: lesson ? `${lesson.title} · Studybook` : 'Studybook' };
}

/** A lesson with its files, rendered on the server with no editor code (CNT-02, CNT-03). */
export default async function LessonPage({ params }: Props) {
  const { groupId, lessonId } = await params;
  if (!(await getMe())) redirect(`/login?${new URLSearchParams({ next: `/groups/${groupId}/lessons/${lessonId}` })}`);
  const [group, lesson] = await Promise.all([getGroup(groupId), getLesson(groupId, lessonId)]);
  if (!group || !lesson) notFound();
  const t = await getTranslations('Courses');
  const manages = (group.myRole === 'leader' || group.myRole === 'moderator') && group.status === 'active';
  const viewers = group.myRole === 'leader' && lesson.published ? await getLessonViewers(group.id, lesson.id) : null;
  const base = `/groups/${group.id}`;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <Link href={`${base}/courses/${lesson.course.id}`} className="flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeftIcon className="size-4" aria-hidden />
        <span className="break-words">
          {lesson.course.title} · {lesson.module.title}
        </span>
      </Link>

      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold break-words">
          {lesson.title}
          {!lesson.published && <span className="ml-2 rounded bg-muted px-2 py-0.5 align-middle text-xs font-normal">{t('draft')}</span>}
        </h1>
        {manages && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`${base}/lessons/${lesson.id}/edit`}>
              <PencilIcon aria-hidden />
              {t('edit')}
            </Link>
          </Button>
        )}
      </div>

      {viewers && <LessonViewers viewers={viewers} />}

      <RichTextView doc={lesson.body} />
      <LessonAttachments attachments={lesson.attachments} />
      <LessonViewRecorder groupId={group.id} lessonId={lesson.id} />

      <nav aria-label={t('lessonNav')} className="flex justify-between gap-2 border-t pt-4">
        {lesson.previousLessonId ? (
          <Button variant="ghost" asChild>
            <Link href={`${base}/lessons/${lesson.previousLessonId}`}>
              <ArrowLeftIcon aria-hidden />
              {t('previous')}
            </Link>
          </Button>
        ) : (
          <span />
        )}
        {lesson.nextLessonId && (
          <Button variant="ghost" asChild>
            <Link href={`${base}/lessons/${lesson.nextLessonId}`}>
              {t('next')}
              <ArrowRightIcon aria-hidden />
            </Link>
          </Button>
        )}
      </nav>
    </main>
  );
}
