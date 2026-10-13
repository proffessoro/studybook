'use client';

import { type FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PlusIcon } from 'lucide-react';
import { SubmitButton } from '@/components/submit-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useApiErrorMessages } from '@/lib/api-errors';

export function NewCourse({ groupId }: { groupId: string }) {
  const t = useTranslations('Courses');
  const messages = useApiErrorMessages();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = String(new FormData(event.currentTarget).get('title') ?? '');
    setPending(true);
    setError(undefined);
    try {
      const { data, error: apiError } = await api.POST('/api/v1/groups/{groupId}/courses', { params: { path: { groupId } }, body: { title } });
      if (data) {
        router.push(`/groups/${groupId}/courses/${data.id}`);
        return;
      }
      if (apiError) setError(apiError.code === 'VALIDATION_FAILED' ? t('titleRequired') : messages.api(apiError));
    } catch {
      setError(messages.network());
    }
    setPending(false);
  }

  if (!open) {
    return (
      <Button variant="outline" className="self-start" onClick={() => setOpen(true)}>
        <PlusIcon aria-hidden />
        {t('new')}
      </Button>
    );
  }

  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-2 rounded-lg border p-4">
      <label htmlFor="new-course-title" className="text-sm font-medium">
        {t('newTitle')}
      </label>
      <Input id="new-course-title" name="title" maxLength={150} required autoFocus />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <SubmitButton pending={pending}>{t('create')}</SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}
