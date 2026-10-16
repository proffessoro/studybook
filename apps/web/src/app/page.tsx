import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';

export default async function HomePage() {
  const t = await getTranslations('Home');

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-12">
      <h1 className="text-3xl font-bold">{t('title')}</h1>
      <p className="text-lg text-muted-foreground">{t('tagline')}</p>
      <Button size="lg" asChild>
        <a href="#">{t('cta')}</a>
      </Button>
    </main>
  );
}
