import { getFormatter, getTranslations } from 'next-intl/server';
import { DownloadIcon, ExternalLinkIcon } from 'lucide-react';
import type { LessonAttachment } from '@studybook/shared';
import { AttachmentIcon } from '@/components/content/attachment-icon';
import { Button } from '@/components/ui/button';
import { formatFileSize } from '@/lib/file-size';

/**
 * A lesson's PDFs, audio, and video (CNT-02). Players use the browser's own
 * controls and stream with range requests. Nothing downloads before the member
 * presses play, and nothing autoplays (CNT-04).
 */
export async function LessonAttachments({ attachments }: { attachments: LessonAttachment[] }) {
  if (attachments.length === 0) return null;
  const t = await getTranslations('LessonFiles');
  const format = await getFormatter();

  return (
    <section aria-label={t('title')} className="flex flex-col gap-4">
      {attachments.map((file) => {
        const size = formatFileSize(format, file.sizeBytes);
        const download = (
          <a href={file.url} download={file.filename} className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-2 hover:underline">
            <DownloadIcon className="size-4" aria-hidden />
            {t('download', { size })}
          </a>
        );
        return (
          <figure key={file.id} className="flex flex-col gap-2 rounded-lg border p-3">
            <figcaption className="flex items-center gap-2 font-medium">
              <AttachmentIcon kind={file.kind} className="size-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 break-words">{file.filename}</span>
            </figcaption>
            {file.kind === 'pdf' && (
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" size="sm" asChild>
                  <a href={file.url} target="_blank" rel="noopener">
                    <ExternalLinkIcon aria-hidden />
                    {t('openPdf')}
                  </a>
                </Button>
                {download}
              </div>
            )}
            {file.kind === 'audio' && (
              <>
                <audio controls preload="none" src={file.url} className="w-full">
                  {t('noPlayer')}
                </audio>
                {download}
              </>
            )}
            {file.kind === 'video' && (
              <>
                <video controls preload="none" playsInline src={file.url} className="aspect-video w-full rounded-md bg-black">
                  {t('noPlayer')}
                </video>
                {download}
              </>
            )}
          </figure>
        );
      })}
    </section>
  );
}
