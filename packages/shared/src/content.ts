import { z } from 'zod';

/**
 * Lesson text (CNT-02): headings, bold, lists, links, images. Stored as JSON in
 * the shape the editor (TipTap) produces, limited to these nodes and marks.
 * Anything else is refused and unknown attributes are dropped, so nothing the
 * browser could run is ever stored (design §8: rich text sanitised on the server).
 */
const href = z
  .string()
  .max(2000)
  .refine((value) => /^(https?:\/\/|mailto:)/i.test(value), { params: { code: 'invalid_link' } });

const Mark = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bold') }),
  z.object({ type: z.literal('italic') }),
  z.object({ type: z.literal('link'), attrs: z.object({ href }) }),
]);

const Text = z.object({
  type: z.literal('text'),
  text: z.string().min(1).max(10_000),
  marks: z.array(Mark).max(5).optional(),
});
const HardBreak = z.object({ type: z.literal('hardBreak') });
const Inline = z.discriminatedUnion('type', [Text, HardBreak]);

const Paragraph = z.object({ type: z.literal('paragraph'), content: z.array(Inline).max(1000).optional() });
const Heading = z.object({
  type: z.literal('heading'),
  attrs: z.object({ level: z.union([z.literal(2), z.literal(3)]) }),
  content: z.array(Inline).max(1000).optional(),
});

/** An image from the group's own files: `/api/v1/files/<id>` (checked against the group by the API). */
export const LESSON_IMAGE_SRC = /^\/api\/v1\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const Image = z.object({
  type: z.literal('image'),
  attrs: z.object({ src: z.string().regex(LESSON_IMAGE_SRC), alt: z.string().max(300).nullish() }),
});

type ListNode = { type: 'bulletList' | 'orderedList'; content: { type: 'listItem'; content: (z.infer<typeof Paragraph> | ListNode)[] }[] };

const ListItem: z.ZodType<ListNode['content'][number]> = z.lazy(() =>
  z.object({ type: z.literal('listItem'), content: z.array(z.union([Paragraph, List])).min(1).max(100) }),
);
const List: z.ZodType<ListNode> = z.lazy(() =>
  z.object({ type: z.enum(['bulletList', 'orderedList']), content: z.array(ListItem).min(1).max(500) }),
);

const Block = z.union([Paragraph, Heading, Image, List]);

export const RichText = z
  .object({ type: z.literal('doc'), content: z.array(Block).max(2000) })
  .refine((doc) => JSON.stringify(doc).length <= 300_000, { params: { code: 'too_long' } });
export type RichText = z.infer<typeof RichText>;

export const EMPTY_RICH_TEXT: RichText = { type: 'doc', content: [] };

/** The file ids of the images in a lesson, to check they belong to the group. */
export function imageFileIds(doc: RichText): string[] {
  const ids: string[] = [];
  for (const block of doc.content) {
    if (block.type === 'image') {
      const id = LESSON_IMAGE_SRC.exec(block.attrs.src)?.[1];
      if (id) ids.push(id);
    }
  }
  return ids;
}

const title = z.string().trim().min(1).max(150);

export const CreateCourseInput = z
  .object({ title, description: z.string().trim().max(2000).optional() })
  .meta({ id: 'CreateCourseInput' });
export type CreateCourseInput = z.input<typeof CreateCourseInput>;

export const UpdateCourseInput = z
  .object({ title, description: z.string().trim().max(2000), published: z.boolean() })
  .partial()
  .meta({ id: 'UpdateCourseInput' });
export type UpdateCourseInput = z.input<typeof UpdateCourseInput>;

export const TitleInput = z.object({ title }).meta({ id: 'TitleInput' });
export type TitleInput = z.input<typeof TitleInput>;

/**
 * The lesson body is checked by `RichText` in the API; the documented schema
 * stays open because the format is recursive.
 */
export const UpdateLessonInput = z
  .object({ title, body: z.record(z.string(), z.unknown()), published: z.boolean() })
  .partial()
  .meta({ id: 'UpdateLessonInput' });
export type UpdateLessonInput = z.input<typeof UpdateLessonInput>;

/** CNT-01: items can be reordered. The ids, in their new order. */
export const ReorderInput = z.object({ ids: z.array(z.string()).min(1).max(500) }).meta({ id: 'ReorderInput' });
export type ReorderInput = z.input<typeof ReorderInput>;

export const CourseSummary = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    published: z.boolean(),
    lessonCount: z.number(),
  })
  .meta({ id: 'CourseSummary' });
export type CourseSummary = z.infer<typeof CourseSummary>;

export const CourseList = z.object({ courses: z.array(CourseSummary) }).meta({ id: 'CourseList' });
export type CourseList = z.infer<typeof CourseList>;

/** A course with its modules and lessons (titles only). Members see published lessons only. */
export const CourseOutline = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    published: z.boolean(),
    modules: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        lessons: z.array(z.object({ id: z.string(), title: z.string(), published: z.boolean() })),
      }),
    ),
  })
  .meta({ id: 'CourseOutline' });
export type CourseOutline = z.infer<typeof CourseOutline>;

export const LessonView = z
  .object({
    id: z.string(),
    title: z.string(),
    published: z.boolean(),
    /** Checked `RichText` */
    body: z.record(z.string(), z.unknown()),
    course: z.object({ id: z.string(), title: z.string() }),
    module: z.object({ id: z.string(), title: z.string() }),
    /** Neighbours in the course, for "previous" and "next" */
    previousLessonId: z.string().nullable(),
    nextLessonId: z.string().nullable(),
  })
  .meta({ id: 'LessonView' });
export type LessonView = z.infer<typeof LessonView>;

export const CreatedId = z.object({ id: z.string() }).meta({ id: 'CreatedId' });
export type CreatedId = z.infer<typeof CreatedId>;
