'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { describedBy, FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { fieldErrorsOf, useApiErrorMessages } from '@/lib/api-errors';

/**
 * Enter the emailed code, or open the emailed link: the link carries the email
 * and code, and the form submits itself. Email scanners that prefetch links
 * don't run JavaScript, so they can't use up the code.
 */
export function VerifyEmailForm({
  email: initialEmail,
  code: initialCode,
  justSent,
}: {
  email: string;
  code: string;
  justSent: boolean;
}) {
  const t = useTranslations('VerifyEmail');
  const messages = useApiErrorMessages();
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState(initialCode);
  const [pending, setPending] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const autoSubmitted = useRef(false);

  async function verify(emailValue: string, codeValue: string) {
    setPending(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const { data, error: apiError } = await api.POST('/api/v1/auth/verify-email', {
        body: { email: emailValue, code: codeValue.replace(/\s/g, '') },
      });
      if (data) setVerified(true);
      else if (apiError) {
        const fields = fieldErrorsOf(apiError);
        setError(fields.code ? t('codeFormat') : fields.email ? messages.field('email', fields.email) : messages.api(apiError));
      }
    } catch {
      setError(messages.network());
    }
    setPending(false);
  }

  useEffect(() => {
    if (initialEmail && /^\d{6}$/.test(initialCode) && !autoSubmitted.current) {
      autoSubmitted.current = true;
      void verify(initialEmail, initialCode);
    }
    // Runs once, for codes that arrive in the link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function resend() {
    setError(undefined);
    setNotice(undefined);
    try {
      const { error: apiError } = await api.POST('/api/v1/auth/verify-email/resend', { body: { email } });
      if (apiError) setError(messages.api(apiError));
      else setNotice(t('resent', { email }));
    } catch {
      setError(messages.network());
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void verify(email, code);
  }

  if (verified) {
    return (
      <div role="status" className="flex flex-col gap-4">
        <p className="text-lg font-medium">{t('verified')}</p>
        <p className="text-muted-foreground">{t('verifiedNext')}</p>
        <Button size="lg" asChild>
          <Link href={`/login?${new URLSearchParams({ email })}`}>{t('login')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <p className="text-muted-foreground">{justSent && initialEmail ? t('sentTo', { email: initialEmail }) : t('intro')}</p>

      <FormField id="email" label={t('email')}>
        <Input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </FormField>

      <FormField id="code" label={t('code')} error={error}>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={7}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="text-center text-2xl tracking-[0.5em]"
          required
          {...describedBy('code', { error })}
        />
      </FormField>

      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t('submitting') : t('submit')}
      </Button>
      <Button type="button" variant="ghost" onClick={resend} disabled={pending || !email}>
        {t('resend')}
      </Button>
    </form>
  );
}
