import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { getMe } from '@/lib/server-api';

export default async function HomePage() {
  if (await getMe()) redirect('/groups');
  const t = await getTranslations('Home');

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-12">
      <h1 className="text-3xl font-bold">{t('title')}</h1>
      <p className="text-lg text-muted-foreground">{t('tagline')}</p>
      <Button size="lg" asChild>
        <Link href="/signup">{t('cta')}</Link>
      </Button>
      <Button size="lg" variant="outline" asChild>
        <Link href="/catalogue">{t('browse')}</Link>
      </Button>
    </main>
  );
}
