import type { FileKind } from '@studybook/shared';

/**
 * What a processed file becomes (design §5.5). Kept apart from the processing
 * code so the API can read it without loading sharp.
 */
export const OUTPUTS: Record<FileKind, { extension: string; mime: string } | null> = {
  image: { extension: 'webp', mime: 'image/webp' },
  audio: { extension: 'm4a', mime: 'audio/mp4' },
  video: { extension: 'mp4', mime: 'video/mp4' },
  // PDFs are stored as they are.
  pdf: null,
};
