import { getTranslations } from 'next-intl/server';

export default async function HomePage() {
  const t = await getTranslations('Home');

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-12">
      <h1 className="text-3xl font-bold">{t('title')}</h1>
      <p className="text-lg text-neutral-600">{t('tagline')}</p>
      <a href="#" className="rounded-lg bg-neutral-900 px-4 py-3 text-center font-medium text-white">
        {t('cta')}
      </a>
    </main>
  );
}
