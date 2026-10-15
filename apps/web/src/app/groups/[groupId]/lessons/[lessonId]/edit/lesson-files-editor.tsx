'use client';

import { type ChangeEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { ArrowDownIcon, ArrowUpIcon, PaperclipIcon, Trash2Icon, XIcon } from 'lucide-react';
import type { LessonAttachment } from '@studybook/shared';
import { AttachmentIcon } from '@/components/content/attachment-icon';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { fieldErrorsOf, useApiErrorMessages } from '@/lib/api-errors';
import { formatFileSize } from '@/lib/file-size';
import { moved } from '@/lib/reorder';
import { uploadFile } from '@/lib/upload';
import { useHydrated } from '@/lib/use-hydrated';

type Kind = LessonAttachment['kind'];

/** What phones commonly produce, including WhatsApp voice notes (.opus, .amr) the browser may not label. */
const ACCEPT = 'application/pdf,.pdf,audio/*,.mp3,.m4a,.aac,.ogg,.opus,.wav,.amr,video/*,.mp4,.webm,.mov,.3gp';
const EXTENSION_KINDS: Record<string, Kind> = {
  pdf: 'pdf',
  mp3: 'audio',
  m4a: 'audio',
  aac: 'audio',
  ogg: 'audio',
  opus: 'audio',
  wav: 'audio',
  amr: 'audio',
  mp4: 'video',
  webm: 'video',
  mov: 'video',
  '3gp': 'video',
};

/** A first guess from the browser; the API checks the bytes themselves. */
function kindOf(file: File): Kind | undefined {
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('video/')) return 'video';
  return EXTENSION_KINDS[file.name.split('.').pop()?.toLowerCase() ?? ''];
}

/** CNT-02 for leaders and moderators: add PDFs, audio, and video to a lesson, order them, remove them. */
export function LessonFilesEditor({ groupId, lessonId, attachments }: { groupId: string; lessonId: string; attachments: LessonAttachment[] }) {
  const t = useTranslations('LessonFiles');
  const format = useFormatter();
  const messages = useApiErrorMessages();
  const router = useRouter();
  const hydrated = useHydrated();
  const picker = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController>(undefined);
  const [upload, setUpload] = useState<{ name: string; fraction: number }>();
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string>();
  const [error, setError] = useState<string>();
  const path = { groupId, lessonId };

  async function add(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(undefined);
    const kind = kindOf(file);
    if (!kind) {
      setError(t('wrongType'));
      return;
    }

    const controller = new AbortController();
    abort.current = controller;
    setUpload({ name: file.name, fraction: 0 });
    const result = await uploadFile(groupId, file, kind, {
      signal: controller.signal,
      onProgress: (fraction) => setUpload({ name: file.name, fraction }),
    });
    abort.current = undefined;

    if ('error' in result) {
      setUpload(undefined);
      if (result.error === 'aborted') return;
      setError(result.error === 'network' ? messages.network() : messages.api(result.error));
      return;
    }
    try {
      const { error: apiError } = await api.POST('/api/v1/groups/{groupId}/lessons/{lessonId}/attachments', {
        params: { path },
        body: { fileId: result.file.id },
      });
      if (apiError) {
        // Not attached: don't leave the file taking up the group's storage.
        await api.DELETE('/api/v1/files/{fileId}', { params: { path: { fileId: result.file.id } } }).catch(() => undefined);
        setError(fieldErrorsOf(apiError).fileId ? t('wrongType') : messages.api(apiError));
      } else {
        router.refresh();
      }
    } catch {
      setError(messages.network());
    }
    setUpload(undefined);
  }

  async function run(request: () => Promise<{ error?: Parameters<typeof messages.api>[0] }>) {
    setBusy(true);
    setError(undefined);
    try {
      const { error: apiError } = await request();
      if (apiError) setError(messages.api(apiError));
      else {
        setConfirmRemove(undefined);
        router.refresh();
      }
    } catch {
      setError(messages.network());
    }
    setBusy(false);
  }

  const ids = attachments.map((a) => a.id);
  const move = (index: number, delta: number) =>
    run(() => api.PUT('/api/v1/groups/{groupId}/lessons/{lessonId}/attachments/order', { params: { path }, body: { ids: moved(ids, index, delta) } }));
  const remove = (attachmentId: string) =>
    run(() => api.DELETE('/api/v1/groups/{groupId}/lessons/{lessonId}/attachments/{attachmentId}', { params: { path: { ...path, attachmentId } } }));

  return (
    <section aria-labelledby="lesson-files" className="flex flex-col gap-3 border-t pt-6">
      <div>
        <h2 id="lesson-files" className="text-lg font-semibold">
          {t('title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('hint')}</p>
      </div>

      {attachments.length > 0 && (
        <ol className="flex flex-col divide-y rounded-lg border">
          {attachments.map((file, index) => (
            <li key={file.id} className="flex flex-wrap items-center gap-2 p-2">
              <AttachmentIcon kind={file.kind} className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="break-words">{file.filename}</p>
                <p className="text-xs text-muted-foreground">
                  {t(`kind.${file.kind}`)} · {formatFileSize(format, file.sizeBytes)}
                </p>
              </div>
              <div className="flex shrink-0">
                <Button size="icon" variant="ghost" onClick={() => move(index, -1)} disabled={index === 0 || busy} aria-label={t('moveUp', { name: file.filename })}>
                  <ArrowUpIcon aria-hidden />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => move(index, 1)}
                  disabled={index === attachments.length - 1 || busy}
                  aria-label={t('moveDown', { name: file.filename })}
                >
                  <ArrowDownIcon aria-hidden />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setConfirmRemove(file.id)} disabled={busy} aria-label={t('remove', { name: file.filename })}>
                  <Trash2Icon aria-hidden />
                </Button>
              </div>
              {confirmRemove === file.id && (
                <div role="alertdialog" aria-label={t('remove', { name: file.filename })} className="flex w-full flex-col gap-2 rounded-md bg-muted p-3 text-sm">
                  <p>{t('removeConfirm')}</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="destructive" disabled={busy} onClick={() => remove(file.id)}>
                      {t('removeButton')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(undefined)}>
                      {t('cancel')}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {upload ? (
        <div className="flex flex-col gap-2 rounded-lg border p-3" role="status">
          <p className="text-sm break-words">{t('uploading', { name: upload.name })}</p>
          <div className="flex items-center gap-2">
            <progress value={upload.fraction} max={1} aria-label={t('progress', { name: upload.name })} className="h-2 flex-1 accent-primary" />
            <span className="w-10 text-right text-sm tabular-nums">{format.number(upload.fraction, { style: 'percent' })}</span>
            <Button size="sm" variant="ghost" onClick={() => abort.current?.abort()}>
              <XIcon aria-hidden />
              {t('cancelUpload')}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button variant="outline" disabled={!hydrated || busy} onClick={() => picker.current?.click()}>
            <PaperclipIcon aria-hidden />
            {t('add')}
          </Button>
          <input ref={picker} type="file" accept={ACCEPT} className="hidden" onChange={add} aria-label={t('add')} />
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
