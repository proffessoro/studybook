import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { MenuIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { LanguageSwitcher } from '@/components/language-switcher';
import { UserMenu } from '@/components/user-menu';
import { getMe } from '@/lib/server-api';

/** Links shown in the header on wide screens and in the menu sheet on phones. Later steps add to these lists. */
const visitorItems = [
  { href: '/', key: 'home' },
  { href: '/login', key: 'login' },
  { href: '/signup', key: 'signup' },
] as const;
const memberItems = [{ href: '/groups', key: 'groups' }] as const;

export async function SiteHeader() {
  const t = await getTranslations('Nav');
  const me = await getMe();
  const navItems = me ? memberItems : visitorItems;

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4">
        <Link href={me ? '/groups' : '/'} className="mr-auto text-lg font-bold">
          Studybook
        </Link>

        <nav aria-label={t('label')} className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <Button key={item.href} variant="ghost" size="sm" asChild>
              <Link href={item.href}>{t(item.key)}</Link>
            </Button>
          ))}
        </nav>

        <LanguageSwitcher />
        {me && <UserMenu pseudo={me.pseudo} />}

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label={t('open')}>
              <MenuIcon aria-hidden />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <SheetHeader>
              <SheetTitle>Studybook</SheetTitle>
              <SheetDescription className="sr-only">{t('label')}</SheetDescription>
            </SheetHeader>
            <nav aria-label={t('label')} className="flex flex-col gap-1 px-4">
              {navItems.map((item) => (
                <SheetClose key={item.href} asChild>
                  <Button variant="ghost" className="justify-start" asChild>
                    <Link href={item.href}>{t(item.key)}</Link>
                  </Button>
                </SheetClose>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
