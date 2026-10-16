import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SignUpForm } from './signup-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('SignUp');
  return { title: `${t('title')} · Studybook` };
}

export default async function SignUpPage() {
  const t = await getTranslations('SignUp');

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('intro')}</p>
      </div>
      <SignUpForm />
    </main>
  );
}
