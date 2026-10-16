import { describe, expect, it } from 'vitest';
import { renderEmail } from './templates.js';

const data = { pseudo: '<b>ama</b>', code: '123456', link: 'http://localhost:3000/verify-email?x=1&y=2' };

describe('renderEmail', () => {
  it('writes in the recipient language', () => {
    expect(renderEmail({ to: 'a@b.cm', locale: 'fr', template: 'verify-email', data }).subject).toBe(
      '123456 est votre code Studybook',
    );
    expect(renderEmail({ to: 'a@b.cm', locale: 'en', template: 'verify-email', data }).subject).toBe(
      '123456 is your Studybook code',
    );
  });

  it('escapes user input in the HTML', () => {
    const { html } = renderEmail({ to: 'a@b.cm', locale: 'en', template: 'verify-email', data });
    expect(html).not.toContain('<b>ama</b>');
    expect(html).toContain('&#60;b&#62;ama');
    expect(html).toContain('x=1&#38;y=2');
  });

  it('renders the reset email with its link', () => {
    const job = { to: 'a@b.cm', locale: 'fr', template: 'reset-password', data: { pseudo: 'ama', link: data.link } } as const;
    const { subject, text, html } = renderEmail(job);
    expect(subject).toBe('Réinitialiser votre mot de passe Studybook');
    expect(text).toContain(data.link);
    expect(html).toContain('x=1&#38;y=2');
  });
});
