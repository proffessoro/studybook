import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { getInvitePreview } from '@/lib/server-api';
import { JoinButton } from './join-button';

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const preview = await getInvitePreview((await params).token);
  return { title: preview ? `${preview.groupName} · Studybook` : 'Studybook' };
}

/** Where an invite link leads (GRP-03). Logged out: sign up or log in, then come back here. */
export default async function JoinPage({ params }: Props) {
  const { token } = await params;
  const [t, preview] = await Promise.all([getTranslations('Join'), getInvitePreview(token)]);
  if (preview?.viewer === 'member' && preview.groupId) redirect(`/groups/${preview.groupId}`);
  const here = `/join/${token}`;

  if (!preview) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-8">
        <h1 className="text-2xl font-bold">{t('invalidTitle')}</h1>
        <p className="text-muted-foreground">{t('invalidText')}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{t('invitedTo')}</p>
        <h1 className="text-2xl font-bold break-words">{preview.groupName}</h1>
        <p className="text-sm text-muted-foreground">{t('memberCount', { count: preview.memberCount })}</p>
      </div>
      {preview.description && <p className="whitespace-pre-line">{preview.description}</p>}

      {preview.viewer === null ? (
        <div className="flex flex-col gap-3">
          <p>{t('loggedOut')}</p>
          <Button size="lg" asChild>
            <Link href={`/signup?${new URLSearchParams({ next: here })}`}>{t('signUp')}</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href={`/login?${new URLSearchParams({ next: here })}`}>{t('logIn')}</Link>
          </Button>
        </div>
      ) : preview.viewer === 'banned' ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t('banned')}
        </p>
      ) : preview.viewer === 'pending' ? (
        <p role="status" className="rounded-md bg-muted px-3 py-2">
          {t('pending')}
        </p>
      ) : preview.full ? (
        <p role="alert" className="rounded-md bg-muted px-3 py-2">
          {t('full')}
        </p>
      ) : (
        <JoinButton token={token} requiresApproval={preview.requiresApproval} />
      )}
    </main>
  );
}
