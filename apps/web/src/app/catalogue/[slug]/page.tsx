import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowLeftIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getCatalogueGroup, getCategories } from '@/lib/server-api';
import { RequestToJoin } from './request-to-join';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const group = await getCatalogueGroup((await params).slug);
  if (!group) return { title: 'Studybook' };
  return { title: `${group.name} · Studybook`, description: group.description.slice(0, 160) || undefined };
}

/** A listed group's public page (GRP-04). Members-only content stays inside the group. */
export default async function CatalogueGroupPage({ params }: Props) {
  const { slug } = await params;
  const [t, locale, categories, group] = await Promise.all([
    getTranslations('Catalogue'),
    getLocale(),
    getCategories(),
    getCatalogueGroup(slug),
  ]);
  if (!group) notFound();
  if (group.viewer === 'member' && group.groupId) redirect(`/groups/${group.groupId}`);
  const here = `/catalogue/${slug}`;
  const nameOf = (key: string) => {
    const c = categories.find((cat) => cat.key === key);
    return c ? (locale === 'en' ? c.nameEn : c.nameFr) : key;
  };

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <Link href="/catalogue" className="flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeftIcon className="size-4" aria-hidden />
        {t('title')}
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold break-words">{group.name}</h1>
        <p className="text-sm text-muted-foreground">
          {t('memberCount', { count: group.memberCount })}
          {group.languageLabel && ` · ${group.languageLabel}`}
          {group.categoryKeys.length > 0 && ` · ${group.categoryKeys.map(nameOf).join(', ')}`}
        </p>
        {group.tags.length > 0 && (
          <p className="flex flex-wrap gap-1">
            {group.tags.map((tag) => (
              <Link key={tag} href={`/catalogue?${new URLSearchParams({ q: tag })}`} className="rounded bg-muted px-2 py-0.5 text-xs">
                #{tag}
              </Link>
            ))}
          </p>
        )}
      </div>
      {group.description && <p className="whitespace-pre-line">{group.description}</p>}

      {group.viewer === null ? (
        <div className="flex flex-col gap-3">
          <p>{t('loggedOut')}</p>
          <Button size="lg" asChild>
            <Link href={`/signup?${new URLSearchParams({ next: here })}`}>{t('signUp')}</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href={`/login?${new URLSearchParams({ next: here })}`}>{t('logIn')}</Link>
          </Button>
        </div>
      ) : group.viewer === 'banned' ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t('banned')}
        </p>
      ) : group.viewer === 'pending' ? (
        <p role="status" className="rounded-md bg-muted px-3 py-2">
          {t('pending')}
        </p>
      ) : group.full ? (
        <p role="alert" className="rounded-md bg-muted px-3 py-2">
          {t('full')}
        </p>
      ) : (
        <RequestToJoin slug={slug} />
      )}
    </main>
  );
}
