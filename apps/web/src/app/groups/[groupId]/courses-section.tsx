import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { CourseSummary } from '@studybook/shared';
import { NewCourse } from './new-course';

/** The group's courses on its home page (CNT-01). Managers also see drafts and can add one. */
export async function CoursesSection({ groupId, courses, manages }: { groupId: string; courses: CourseSummary[]; manages: boolean }) {
  const t = await getTranslations('Courses');

  return (
    <section className="flex flex-col gap-3" aria-labelledby="courses-heading">
      <h2 id="courses-heading" className="text-lg font-semibold">
        {t('title')}
      </h2>
      {courses.length === 0 ? (
        <p className="text-muted-foreground">{manages ? t('emptyManager') : t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {courses.map((course) => (
            <li key={course.id}>
              <Link
                href={`/groups/${groupId}/courses/${course.id}`}
                className="flex flex-col gap-1 rounded-lg border p-4 transition-colors hover:bg-accent"
              >
                <span className="font-medium break-words">
                  {course.title}
                  {!course.published && <span className="ml-2 rounded bg-muted px-2 py-0.5 text-xs font-normal">{t('draft')}</span>}
                </span>
                <span className="text-sm text-muted-foreground">{t('lessonCount', { count: course.lessonCount })}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {manages && <NewCourse groupId={groupId} />}
    </section>
  );
}
