'use client';

import { type ChangeEvent, type FormEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Image from '@tiptap/extension-image';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { BoldIcon, Heading2Icon, Heading3Icon, ImageIcon, ItalicIcon, LinkIcon, ListIcon, ListOrderedIcon } from 'lucide-react';
import type { LessonView } from '@studybook/shared';
import { CheckField, FormField } from '@/components/form-field';
import { SubmitButton } from '@/components/submit-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { fieldErrorsOf, useApiErrorMessages } from '@/lib/api-errors';
import { cn } from '@/lib/utils';
import { uploadFile } from '@/lib/upload';

/** Only what the API accepts: no code, quotes, strikes, rules, or level-1 headings. */
const EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    blockquote: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    strike: false,
    underline: false,
    link: { openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'], defaultProtocol: 'https' },
  }),
  Image,
];

const EDITOR_ATTRIBUTES = {
  class:
    'min-h-64 rounded-b-md border border-t-0 p-3 leading-relaxed focus:outline-none [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_a]:underline [&_img]:max-w-full [&_img]:rounded-md [&_p]:my-2',
  role: 'textbox',
  'aria-multiline': 'true',
};

/**
 * Lesson editing (CNT-02): headings, bold, lists, links, images. The editor is
 * limited to what the API accepts (`RichText` in packages/shared); the API checks again.
 */
export function LessonEditor({ groupId, lesson }: { groupId: string; lesson: LessonView }) {
  const t = useTranslations('Courses');
  const messages = useApiErrorMessages();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  // Created once (empty deps): the editor keeps its own state, so there is no
  // reason to hand it new options on every render.
  const editor = useEditor(
    {
      extensions: EXTENSIONS,
      content: lesson.body,
      immediatelyRender: false,
      editorProps: { attributes: { ...EDITOR_ATTRIBUTES, 'aria-label': t('lessonBody') } },
      // A tap in the empty space of the box can leave the cursor outside any
      // paragraph; a heading or list applied there would vanish on the first key.
      onFocus: ({ editor: e }) => {
        if (!e.state.selection.$from.parent.isTextblock) e.commands.focus('end');
      },
    },
    [],
  );

  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h2: e?.isActive('heading', { level: 2 }) ?? false,
      h3: e?.isActive('heading', { level: 3 }) ?? false,
      bold: e?.isActive('bold') ?? false,
      italic: e?.isActive('italic') ?? false,
      bullet: e?.isActive('bulletList') ?? false,
      ordered: e?.isActive('orderedList') ?? false,
      link: e?.isActive('link') ?? false,
    }),
  });

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setSaved(false);
    setError(undefined);
    try {
      const { error: apiError } = await api.PATCH('/api/v1/groups/{groupId}/lessons/{lessonId}', {
        params: { path: { groupId, lessonId: lesson.id } },
        body: { title: String(form.get('title') ?? ''), body: editor.getJSON(), published: form.get('published') === 'on' },
      });
      if (!apiError) {
        setSaved(true);
        router.refresh();
      } else {
        const fields = fieldErrorsOf(apiError);
        if (fields.title) setError(t('titleRequired'));
        else if (fields.body) setError(fields.body.includes('invalid_link') ? t('invalidLink') : fields.body.includes('unknown_image') ? t('unknownImage') : t('invalidBody'));
        else setError(messages.api(apiError));
      }
    } catch {
      setError(messages.network());
    }
    setPending(false);
  }

  function applyLink(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    const url = linkUrl.trim();
    if (!url) editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: /^(https?:|mailto:)/i.test(url) ? url : `https://${url}` }).run();
    setLinkOpen(false);
    setLinkUrl('');
  }

  async function addImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !editor) return;
    setUploading(true);
    setError(undefined);
    const result = await uploadFile(groupId, file, 'image');
    if ('file' in result) editor.chain().focus().setImage({ src: result.file.url, alt: '' }).run();
    else setError(result.error === 'network' ? messages.network() : messages.api(result.error));
    setUploading(false);
  }

  // Toolbar buttons must not take focus: the cursor would leave the text, and the
  // next key would land outside the heading or list just applied.
  const keepFocus = (event: React.MouseEvent) => event.preventDefault();
  const tool = (label: string, on: boolean, icon: React.ReactNode, run: () => void) => (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      aria-label={label}
      aria-pressed={on}
      onMouseDown={keepFocus}
      onClick={run}
      className={cn(on && 'bg-accent')}
    >
      {icon}
    </Button>
  );

  return (
    <form method="post" onSubmit={save} className="flex flex-col gap-4">
      <FormField id="lesson-title" label={t('lessonTitle')}>
        <Input id="lesson-title" name="title" defaultValue={lesson.title} maxLength={150} required className="text-lg font-semibold" />
      </FormField>

      <div className="flex flex-col">
        <div role="toolbar" aria-label={t('formatting')} className="flex flex-wrap gap-1 rounded-t-md border bg-muted/40 p-1">
          {tool(t('heading2'), active?.h2 ?? false, <Heading2Icon aria-hidden />, () => editor?.chain().focus().toggleHeading({ level: 2 }).run())}
          {tool(t('heading3'), active?.h3 ?? false, <Heading3Icon aria-hidden />, () => editor?.chain().focus().toggleHeading({ level: 3 }).run())}
          {tool(t('bold'), active?.bold ?? false, <BoldIcon aria-hidden />, () => editor?.chain().focus().toggleBold().run())}
          {tool(t('italic'), active?.italic ?? false, <ItalicIcon aria-hidden />, () => editor?.chain().focus().toggleItalic().run())}
          {tool(t('bulletList'), active?.bullet ?? false, <ListIcon aria-hidden />, () => editor?.chain().focus().toggleBulletList().run())}
          {tool(t('orderedList'), active?.ordered ?? false, <ListOrderedIcon aria-hidden />, () => editor?.chain().focus().toggleOrderedList().run())}
          {tool(t('link'), active?.link ?? false, <LinkIcon aria-hidden />, () => {
            setLinkUrl(editor?.getAttributes('link').href ?? '');
            setLinkOpen((o) => !o);
          })}
          <Button type="button" size="icon" variant="ghost" aria-label={t('image')} disabled={uploading} onClick={() => fileInput.current?.click()}>
            <ImageIcon aria-hidden />
          </Button>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={addImage} />
        </div>
        {linkOpen && (
          <div className="flex gap-2 border border-t-0 p-2">
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyLink(e)}
              placeholder="https://"
              aria-label={t('linkUrl')}
              autoFocus
            />
            <Button type="button" size="sm" onClick={applyLink}>
              {t('applyLink')}
            </Button>
          </div>
        )}
        <EditorContent editor={editor} />
        {uploading && (
          <p role="status" className="mt-1 text-sm text-muted-foreground">
            {t('uploadingImage')}
          </p>
        )}
      </div>

      <CheckField
        id="lesson-published"
        type="checkbox"
        name="published"
        defaultChecked={lesson.published}
        label={t('publishLesson')}
        hint={t('publishLessonHint')}
      />

      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton size="lg" pending={pending || !editor}>
          {t('save')}
        </SubmitButton>
        <Button type="button" variant="outline" asChild>
          <a href={`/groups/${groupId}/lessons/${lesson.id}`}>{t('preview')}</a>
        </Button>
        {saved && (
          <span role="status" className="text-sm text-muted-foreground">
            {t('saved')}
          </span>
        )}
      </div>
    </form>
  );
}
