import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon } from 'lucide-react';
import { getGroup, getLesson, getMe } from '@/lib/server-api';
import { LessonEditorLoader } from './lesson-editor-loader';
import { LessonFilesEditor } from './lesson-files-editor';

type Props = { params: Promise<{ groupId: string; lessonId: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Courses');
  return { title: `${t('editLesson')} · Studybook` };
}

/** Leaders and moderators write lessons here. The editor's code loads only on this page. */
export default async function EditLessonPage({ params }: Props) {
  const { groupId, lessonId } = await params;
  if (!(await getMe())) redirect(`/login?${new URLSearchParams({ next: `/groups/${groupId}/lessons/${lessonId}/edit` })}`);
  const [group, lesson] = await Promise.all([getGroup(groupId), getLesson(groupId, lessonId)]);
  if (!group || !lesson) notFound();
  const manages = (group.myRole === 'leader' || group.myRole === 'moderator') && group.status === 'active';
  if (!manages) redirect(`/groups/${group.id}/lessons/${lesson.id}`);
  const t = await getTranslations('Courses');

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <Link href={`/groups/${group.id}/courses/${lesson.course.id}`} className="flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeftIcon className="size-4" aria-hidden />
        <span className="break-words">
          {lesson.course.title} · {lesson.module.title}
        </span>
      </Link>
      <h1 className="sr-only">{t('editLesson')}</h1>
      <LessonEditorLoader groupId={group.id} lesson={lesson} />
      <LessonFilesEditor groupId={group.id} lessonId={lesson.id} attachments={lesson.attachments} />
    </main>
  );
}
