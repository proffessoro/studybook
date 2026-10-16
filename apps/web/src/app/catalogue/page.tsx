import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { SearchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { getCatalogue, getCategories } from '@/lib/server-api';

type Props = { searchParams: Promise<{ category?: string; q?: string; cursor?: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Catalogue');
  return { title: `${t('title')} · Studybook`, description: t('intro') };
}

/** GRP-04: public and rendered on the server, so search engines can index it (design §5.7). */
export default async function CataloguePage({ searchParams }: Props) {
  const { category, q, cursor } = await searchParams;
  const [t, locale, categories, page] = await Promise.all([
    getTranslations('Catalogue'),
    getLocale(),
    getCategories(),
    getCatalogue({ category, q, cursor }),
  ]);
  if (!page) notFound();
  const nameOf = (key: string) => {
    const c = categories.find((cat) => cat.key === key);
    return c ? (locale === 'en' ? c.nameEn : c.nameFr) : key;
  };
  const href = (params: Record<string, string | undefined>) => {
    const search = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])));
    return `/catalogue${search.size ? `?${search}` : ''}`;
  };

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('intro')}</p>
      </div>

      <form action="/catalogue" role="search" className="flex gap-2">
        {category && <input type="hidden" name="category" value={category} />}
        <Input name="q" type="search" defaultValue={q} placeholder={t('searchPlaceholder')} aria-label={t('search')} />
        <Button type="submit" variant="outline" aria-label={t('search')}>
          <SearchIcon aria-hidden />
        </Button>
      </form>

      <nav aria-label={t('categories')} className="flex flex-wrap gap-2">
        {[{ key: undefined, label: t('all') }, ...categories.map((c) => ({ key: c.key, label: nameOf(c.key) }))].map((item) => (
          <Link
            key={item.key ?? 'all'}
            href={href({ category: item.key, q })}
            aria-current={category === item.key ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1 text-sm',
              category === item.key ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {page.groups.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-muted-foreground">{q ? t('noResults', { q }) : t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {page.groups.map((group) => (
            <li key={group.slug}>
              <Link href={`/catalogue/${group.slug}`} className="flex flex-col gap-2 rounded-lg border p-4 transition-colors hover:bg-accent">
                <span className="font-medium break-words">{group.name}</span>
                {group.description && <span className="line-clamp-2 text-sm text-muted-foreground">{group.description}</span>}
                <span className="text-sm text-muted-foreground">
                  {t('memberCount', { count: group.memberCount })}
                  {group.languageLabel && ` · ${group.languageLabel}`}
                  {group.categoryKeys.length > 0 && ` · ${group.categoryKeys.map(nameOf).join(', ')}`}
                </span>
                {group.tags.length > 0 && (
                  <span className="flex flex-wrap gap-1">
                    {group.tags.map((tag) => (
                      <span key={tag} className="rounded bg-muted px-2 py-0.5 text-xs">
                        #{tag}
                      </span>
                    ))}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {page.nextCursor && (
        <Button variant="outline" className="self-center" asChild>
          <Link href={href({ category, q, cursor: page.nextCursor })}>{t('more')}</Link>
        </Button>
      )}
    </main>
  );
}
