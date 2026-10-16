'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { CheckIcon, LanguagesIcon } from 'lucide-react';
import { Locale } from '@studybook/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { setLocale } from '@/i18n/actions';

export function LanguageSwitcher() {
  const t = useTranslations('LanguageSwitcher');
  const current = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function choose(locale: Locale) {
    startTransition(async () => {
      await setLocale(locale);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={isPending} aria-label={t('label')}>
          <LanguagesIcon aria-hidden />
          <span className="uppercase">{current}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {Locale.options.map((locale) => (
          <DropdownMenuItem key={locale} lang={locale} onSelect={() => choose(locale)}>
            {t(locale)}
            {locale === current && <CheckIcon className="ml-auto" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
