import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon } from 'lucide-react';
import { getCourseOutline, getGroup, getMe } from '@/lib/server-api';
import { CourseEditor } from './course-editor';

type Props = { params: Promise<{ groupId: string; courseId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { groupId, courseId } = await params;
  const course = await getCourseOutline(groupId, courseId);
  return { title: course ? `${course.title} · Studybook` : 'Studybook' };
}

/** A course's outline (CNT-01). Leaders and moderators edit it here. */
export default async function CoursePage({ params }: Props) {
  const { groupId, courseId } = await params;
  if (!(await getMe())) redirect(`/login?${new URLSearchParams({ next: `/groups/${groupId}/courses/${courseId}` })}`);
  const [group, course] = await Promise.all([getGroup(groupId), getCourseOutline(groupId, courseId)]);
  if (!group || !course) notFound();
  const t = await getTranslations('Courses');
  const manages = (group.myRole === 'leader' || group.myRole === 'moderator') && group.status === 'active';

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <Link href={`/groups/${group.id}`} className="flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeftIcon className="size-4" aria-hidden />
        <span className="break-words">{group.name}</span>
      </Link>

      {manages ? (
        <CourseEditor groupId={group.id} course={course} />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold break-words">{course.title}</h1>
            {course.description && <p className="whitespace-pre-line text-muted-foreground">{course.description}</p>}
          </div>
          {course.modules.every((m) => m.lessons.length === 0) ? (
            <p className="text-muted-foreground">{t('noLessons')}</p>
          ) : (
            <ol className="flex flex-col gap-6">
              {course.modules
                .filter((m) => m.lessons.length > 0)
                .map((module) => (
                  <li key={module.id} className="flex flex-col gap-2">
                    <h2 className="font-semibold break-words">{module.title}</h2>
                    <ol className="flex flex-col divide-y rounded-lg border">
                      {module.lessons.map((lesson) => (
                        <li key={lesson.id}>
                          <Link href={`/groups/${group.id}/lessons/${lesson.id}`} className="block p-3 break-words hover:bg-accent">
                            {lesson.title}
                          </Link>
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
            </ol>
          )}
        </>
      )}
    </main>
  );
}
