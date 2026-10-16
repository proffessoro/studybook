import { z } from 'zod';

/** An interest category (GRP-04). Clients show the name in the user's language. */
export const CategoryView = z
  .object({ key: z.string(), nameFr: z.string(), nameEn: z.string() })
  .meta({ id: 'CategoryView' });
export type CategoryView = z.infer<typeof CategoryView>;

export const CategoryList = z.object({ categories: z.array(CategoryView) }).meta({ id: 'CategoryList' });
export type CategoryList = z.infer<typeof CategoryList>;

/** A free tag such as "bepc", "python", or "c++": stored lowercased. */
export const Tag = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(30)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} ._+#-]*$/u);

/** Up to 5 categories and 10 tags per group; duplicates are dropped. */
export const CategoryKeys = z
  .array(z.string())
  .max(5)
  .transform((keys) => [...new Set(keys)]);
export const Tags = z
  .array(Tag)
  .max(10)
  .transform((tags) => [...new Set(tags)]);

const categoryName = z.string().trim().min(2).max(60);

/** Instance admin: a category's key is permanent; names and order can change. */
export const CreateCategoryInput = z
  .object({
    key: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(40),
    nameFr: categoryName,
    nameEn: categoryName,
    sort: z.number().int().default(0),
  })
  .meta({ id: 'CreateCategoryInput' });
export type CreateCategoryInput = z.input<typeof CreateCategoryInput>;

// Written out rather than derived with .partial(): a `.default()` would still fill
// in missing fields and silently overwrite them on every update.
export const UpdateCategoryInput = z
  .object({ nameFr: categoryName, nameEn: categoryName, sort: z.number().int() })
  .partial()
  .meta({ id: 'UpdateCategoryInput' });
export type UpdateCategoryInput = z.input<typeof UpdateCategoryInput>;

/** A listed group as anyone sees it (GRP-04). Members-only content is never part of it. */
export const CatalogueGroup = z
  .object({
    slug: z.string(),
    name: z.string(),
    description: z.string(),
    memberCount: z.number(),
    languageLabel: z.string().nullable(),
    categoryKeys: z.array(z.string()),
    tags: z.array(z.string()),
    /** LIM-02 */
    full: z.boolean(),
  })
  .meta({ id: 'CatalogueGroup' });
export type CatalogueGroup = z.infer<typeof CatalogueGroup>;

export const CataloguePage = z
  .object({
    groups: z.array(CatalogueGroup),
    /** Pass as `cursor` for the next page; null at the end */
    nextCursor: z.string().nullable(),
  })
  .meta({ id: 'CataloguePage' });
export type CataloguePage = z.infer<typeof CataloguePage>;

/** One listed group's public page, with where the visitor stands (null when logged out). */
export const CatalogueGroupDetail = CatalogueGroup.extend({
  viewer: z.enum(['none', 'member', 'pending', 'banned']).nullable(),
  /** Set for members, to go straight to the group */
  groupId: z.string().nullable(),
}).meta({ id: 'CatalogueGroupDetail' });
export type CatalogueGroupDetail = z.infer<typeof CatalogueGroupDetail>;
