'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import type { LessonView } from '@studybook/shared';

/** The editor (TipTap) is only downloaded by people who open this page, never by readers. */
const LessonEditor = dynamic(() => import('./lesson-editor').then((m) => m.LessonEditor), {
  ssr: false,
  loading: () => <EditorLoading />,
});

function EditorLoading() {
  const t = useTranslations('Courses');
  return <p className="text-muted-foreground">{t('editorLoading')}</p>;
}

export function LessonEditorLoader(props: { groupId: string; lesson: LessonView }) {
  return <LessonEditor {...props} />;
}
