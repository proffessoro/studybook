'use client';

import { type FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowDownIcon, ArrowUpIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import type { CourseOutline } from '@studybook/shared';
import { CheckField, FormField } from '@/components/form-field';
import { SubmitButton } from '@/components/submit-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { useApiErrorMessages } from '@/lib/api-errors';

type ApiResult = { error?: Parameters<ReturnType<typeof useApiErrorMessages>['api']>[0] };

/**
 * Reads a new item's title and empties the field right away, so someone typing
 * the next title while this one is saved never has it wiped. `putBack` restores it on failure.
 */
function takeTitle(form: HTMLFormElement): string {
  const input = form.elements.namedItem('title') as HTMLInputElement;
  const title = input.value;
  input.value = '';
  return title;
}

function putBack(form: HTMLFormElement, title: string): void {
  const input = form.elements.namedItem('title') as HTMLInputElement | null;
  if (input && !input.value) input.value = title;
}

/** Moves the item at `index` by `delta` and returns the ids in their new order. */
function moved(ids: string[], index: number, delta: number): string[] {
  const next = [...ids];
  const [item] = next.splice(index, 1);
  next.splice(index + delta, 0, item!);
  return next;
}

/** CNT-01 for leaders and moderators: course details, modules, lessons, order, drafts. */
export function CourseEditor({ groupId, course }: { groupId: string; course: CourseOutline }) {
  const t = useTranslations('Courses');
  const messages = useApiErrorMessages();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string>();
  const g = { groupId };

  async function run(action: () => Promise<ApiResult>, after?: () => void, onError?: () => void) {
    setBusy(true);
    setError(undefined);
    try {
      const { error: apiError } = await action();
      if (apiError) {
        setError(apiError.code === 'VALIDATION_FAILED' ? t('titleRequired') : messages.api(apiError));
        onError?.();
      } else {
        setConfirmDelete(undefined);
        after?.();
        router.refresh();
      }
    } catch {
      setError(messages.network());
      onError?.();
    }
    setBusy(false);
  }

  function saveCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaved(false);
    void run(
      () =>
        api.PATCH('/api/v1/groups/{groupId}/courses/{courseId}', {
          params: { path: { ...g, courseId: course.id } },
          body: {
            title: String(form.get('title') ?? ''),
            description: String(form.get('description') ?? ''),
            published: form.get('published') === 'on',
          },
        }),
      () => setSaved(true),
    );
  }

  const deleteCourse = () =>
    run(
      () => api.DELETE('/api/v1/groups/{groupId}/courses/{courseId}', { params: { path: { ...g, courseId: course.id } } }),
      () => router.push(`/groups/${groupId}`),
    );

  const moduleIds = course.modules.map((m) => m.id);
  const moveModule = (index: number, delta: number) =>
    run(() =>
      api.PUT('/api/v1/groups/{groupId}/courses/{courseId}/modules/order', {
        params: { path: { ...g, courseId: course.id } },
        body: { ids: moved(moduleIds, index, delta) },
      }),
    );

  function addModule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = takeTitle(event.currentTarget);
    void run(
      () => api.POST('/api/v1/groups/{groupId}/courses/{courseId}/modules', { params: { path: { ...g, courseId: course.id } }, body: { title } }),
      undefined,
      () => putBack(event.currentTarget, title),
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <form method="post" onSubmit={saveCourse} className="flex flex-col gap-4">
        <h1 className="sr-only">{course.title}</h1>
        <FormField id="course-title" label={t('courseTitle')}>
          <Input id="course-title" name="title" defaultValue={course.title} maxLength={150} required className="text-lg font-semibold" />
        </FormField>
        <FormField id="course-description" label={t('description')}>
          <Textarea id="course-description" name="description" defaultValue={course.description} rows={3} maxLength={2000} />
        </FormField>
        <CheckField
          id="course-published"
          type="checkbox"
          name="published"
          defaultChecked={course.published}
          label={t('publishCourse')}
          hint={t('publishCourseHint')}
        />
        <div className="flex items-center gap-3">
          <SubmitButton pending={busy}>{t('save')}</SubmitButton>
          {saved && (
            <span role="status" className="text-sm text-muted-foreground">
              {t('saved')}
            </span>
          )}
        </div>
      </form>

      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-6" aria-labelledby="modules-heading">
        <h2 id="modules-heading" className="text-lg font-semibold">
          {t('modules')}
        </h2>
        {course.modules.map((module, index) => (
          <ModuleEditor
            key={module.id}
            groupId={groupId}
            module={module}
            busy={busy}
            run={run}
            onMoveUp={index > 0 ? () => moveModule(index, -1) : undefined}
            onMoveDown={index < course.modules.length - 1 ? () => moveModule(index, 1) : undefined}
            confirmDeleteId={confirmDelete}
            setConfirmDelete={setConfirmDelete}
          />
        ))}
        <form method="post" onSubmit={addModule} className="flex gap-2">
          <Input name="title" placeholder={t('newModulePlaceholder')} aria-label={t('newModule')} maxLength={150} required />
          <SubmitButton variant="outline" pending={busy}>
            <PlusIcon aria-hidden />
            {t('addModule')}
          </SubmitButton>
        </form>
      </section>

      <section className="flex flex-col gap-2 border-t pt-6">
        {confirmDelete === course.id ? (
          <div role="alertdialog" aria-label={t('deleteCourse')} className="flex flex-col gap-2 rounded-md bg-muted p-3 text-sm">
            <p>{t('deleteCourseConfirm')}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={deleteCourse} disabled={busy}>
                {t('delete')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(undefined)}>
                {t('cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" className="self-start text-destructive" onClick={() => setConfirmDelete(course.id)}>
            <Trash2Icon aria-hidden />
            {t('deleteCourse')}
          </Button>
        )}
      </section>
    </div>
  );
}

function ModuleEditor({
  groupId,
  module,
  busy,
  run,
  onMoveUp,
  onMoveDown,
  confirmDeleteId,
  setConfirmDelete,
}: {
  groupId: string;
  module: CourseOutline['modules'][number];
  busy: boolean;
  run: (action: () => Promise<ApiResult>, after?: () => void, onError?: () => void) => Promise<void>;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  confirmDeleteId: string | undefined;
  setConfirmDelete: (id?: string) => void;
}) {
  const t = useTranslations('Courses');
  const [renaming, setRenaming] = useState(false);
  const path = { groupId, moduleId: module.id };
  const lessonIds = module.lessons.map((l) => l.id);

  function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = String(new FormData(event.currentTarget).get('title') ?? '');
    void run(() => api.PATCH('/api/v1/groups/{groupId}/modules/{moduleId}', { params: { path }, body: { title } }), () => setRenaming(false));
  }

  function addLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const title = takeTitle(formEl);
    void run(
      () => api.POST('/api/v1/groups/{groupId}/modules/{moduleId}/lessons', { params: { path }, body: { title } }),
      undefined,
      () => putBack(formEl, title),
    );
  }

  const moveLesson = (index: number, delta: number) =>
    run(() => api.PUT('/api/v1/groups/{groupId}/modules/{moduleId}/lessons/order', { params: { path }, body: { ids: moved(lessonIds, index, delta) } }));

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        {renaming ? (
          <form method="post" onSubmit={rename} className="flex flex-1 gap-2">
            <Input name="title" defaultValue={module.title} aria-label={t('moduleTitle')} maxLength={150} required autoFocus />
            <SubmitButton size="sm" pending={busy}>
              {t('save')}
            </SubmitButton>
          </form>
        ) : (
          <h3 className="font-semibold break-words">{module.title}</h3>
        )}
        <div className="flex shrink-0">
          <Button size="icon" variant="ghost" onClick={() => setRenaming((r) => !r)} aria-label={t('renameModule', { title: module.title })}>
            <PencilIcon aria-hidden />
          </Button>
          <Button size="icon" variant="ghost" onClick={onMoveUp} disabled={!onMoveUp || busy} aria-label={t('moveUp', { title: module.title })}>
            <ArrowUpIcon aria-hidden />
          </Button>
          <Button size="icon" variant="ghost" onClick={onMoveDown} disabled={!onMoveDown || busy} aria-label={t('moveDown', { title: module.title })}>
            <ArrowDownIcon aria-hidden />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setConfirmDelete(module.id)} aria-label={t('deleteModule', { title: module.title })}>
            <Trash2Icon aria-hidden />
          </Button>
        </div>
      </div>

      {confirmDeleteId === module.id && (
        <div role="alertdialog" aria-label={t('deleteModule', { title: module.title })} className="flex flex-col gap-2 rounded-md bg-muted p-3 text-sm">
          <p>{t('deleteModuleConfirm')}</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => run(() => api.DELETE('/api/v1/groups/{groupId}/modules/{moduleId}', { params: { path } }))}
            >
              {t('delete')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(undefined)}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}

      <ol className="flex flex-col divide-y">
        {module.lessons.map((lesson, index) => (
          <li key={lesson.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <Link href={`/groups/${groupId}/lessons/${lesson.id}/edit`} className="min-w-0 break-words underline-offset-2 hover:underline">
              {lesson.title}
              {!lesson.published && <span className="ml-2 rounded bg-muted px-2 py-0.5 text-xs">{t('draft')}</span>}
            </Link>
            <div className="flex shrink-0">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => moveLesson(index, -1)}
                disabled={index === 0 || busy}
                aria-label={t('moveUp', { title: lesson.title })}
              >
                <ArrowUpIcon aria-hidden />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => moveLesson(index, 1)}
                disabled={index === module.lessons.length - 1 || busy}
                aria-label={t('moveDown', { title: lesson.title })}
              >
                <ArrowDownIcon aria-hidden />
              </Button>
              <Button size="icon" variant="ghost" disabled={busy} onClick={() => setConfirmDelete(lesson.id)} aria-label={t('deleteLesson', { title: lesson.title })}>
                <Trash2Icon aria-hidden />
              </Button>
            </div>
            {confirmDeleteId === lesson.id && (
              <div role="alertdialog" aria-label={t('deleteLesson', { title: lesson.title })} className="flex w-full flex-col gap-2 rounded-md bg-muted p-3 text-sm">
                <p>{t('deleteLessonConfirm')}</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => run(() => api.DELETE('/api/v1/groups/{groupId}/lessons/{lessonId}', { params: { path: { groupId, lessonId: lesson.id } } }))}
                  >
                    {t('delete')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(undefined)}>
                    {t('cancel')}
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ol>

      <form method="post" onSubmit={addLesson} className="flex gap-2">
        <Input name="title" placeholder={t('newLessonPlaceholder')} aria-label={t('newLessonIn', { title: module.title })} maxLength={150} required />
        <SubmitButton size="sm" variant="outline" pending={busy}>
          <PlusIcon aria-hidden />
          {t('addLesson')}
        </SubmitButton>
      </form>
    </div>
  );
}
