import { FileTextIcon, FilmIcon, MusicIcon } from 'lucide-react';
import type { LessonAttachment } from '@studybook/shared';

const ICONS = { pdf: FileTextIcon, audio: MusicIcon, video: FilmIcon };

export function AttachmentIcon({ kind, className }: { kind: LessonAttachment['kind']; className?: string }) {
  const Icon = ICONS[kind];
  return <Icon className={className} aria-hidden />;
}
