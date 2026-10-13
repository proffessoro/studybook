import type { Locale } from '@studybook/shared';
import type { EmailJob } from './email-job.js';

export type RenderedEmail = { subject: string; text: string; html: string };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

type DataOf<T extends EmailJob['template']> = Extract<EmailJob, { template: T }>['data'];

const verifyEmail: Record<Locale, (d: DataOf<'verify-email'>) => RenderedEmail> = {
  fr: ({ pseudo, code, link }) => ({
    subject: `${code} est votre code Studybook`,
    text: `Bonjour ${pseudo},\n\nVotre code de vérification : ${code}\n\nOu ouvrez ce lien : ${link}\n\nLe code expire dans 30 minutes. Si vous n'avez pas créé de compte, ignorez cet email.`,
    html: layout(
      `<p>Bonjour ${escapeHtml(pseudo)},</p><p>Votre code de vérification :</p>${codeBlock(code)}<p><a href="${escapeHtml(link)}">Ou cliquez ici pour vérifier votre email</a></p><p style="color:#666">Le code expire dans 30 minutes. Si vous n'avez pas créé de compte, ignorez cet email.</p>`,
    ),
  }),
  en: ({ pseudo, code, link }) => ({
    subject: `${code} is your Studybook code`,
    text: `Hello ${pseudo},\n\nYour verification code: ${code}\n\nOr open this link: ${link}\n\nThe code expires in 30 minutes. If you didn't create an account, ignore this email.`,
    html: layout(
      `<p>Hello ${escapeHtml(pseudo)},</p><p>Your verification code:</p>${codeBlock(code)}<p><a href="${escapeHtml(link)}">Or click here to verify your email</a></p><p style="color:#666">The code expires in 30 minutes. If you didn't create an account, ignore this email.</p>`,
    ),
  }),
};

const resetPassword: Record<Locale, (d: DataOf<'reset-password'>) => RenderedEmail> = {
  fr: ({ pseudo, link }) => ({
    subject: 'Réinitialiser votre mot de passe Studybook',
    text: `Bonjour ${pseudo},

Pour choisir un nouveau mot de passe, ouvrez ce lien : ${link}

Le lien expire dans 1 heure et ne sert qu'une fois. Si vous n'avez rien demandé, ignorez cet email : votre mot de passe ne change pas.`,
    html: layout(
      `<p>Bonjour ${escapeHtml(pseudo)},</p><p>Pour choisir un nouveau mot de passe :</p>${linkButton(link, 'Choisir un nouveau mot de passe')}<p style="color:#666">Le lien expire dans 1 heure et ne sert qu'une fois. Si vous n'avez rien demandé, ignorez cet email : votre mot de passe ne change pas.</p>`,
    ),
  }),
  en: ({ pseudo, link }) => ({
    subject: 'Reset your Studybook password',
    text: `Hello ${pseudo},

To choose a new password, open this link: ${link}

The link expires in 1 hour and works once. If you didn't ask for this, ignore this email: your password stays the same.`,
    html: layout(
      `<p>Hello ${escapeHtml(pseudo)},</p><p>To choose a new password:</p>${linkButton(link, 'Choose a new password')}<p style="color:#666">The link expires in 1 hour and works once. If you didn't ask for this, ignore this email: your password stays the same.</p>`,
    ),
  }),
};

const confirmEmailChange: Record<Locale, (d: DataOf<'confirm-email-change'>) => RenderedEmail> = {
  fr: ({ pseudo, code }) => ({
    subject: `${code} confirme votre nouvel email Studybook`,
    text: `Bonjour ${pseudo},

Pour utiliser cette adresse sur votre compte Studybook, saisissez ce code : ${code}

Le code expire dans 30 minutes. Si vous n'avez rien demandé, ignorez cet email.`,
    html: layout(
      `<p>Bonjour ${escapeHtml(pseudo)},</p><p>Pour utiliser cette adresse sur votre compte Studybook, saisissez ce code :</p>${codeBlock(code)}<p style="color:#666">Le code expire dans 30 minutes. Si vous n'avez rien demandé, ignorez cet email.</p>`,
    ),
  }),
  en: ({ pseudo, code }) => ({
    subject: `${code} confirms your new Studybook email`,
    text: `Hello ${pseudo},

To use this address on your Studybook account, enter this code: ${code}

The code expires in 30 minutes. If you didn't ask for this, ignore this email.`,
    html: layout(
      `<p>Hello ${escapeHtml(pseudo)},</p><p>To use this address on your Studybook account, enter this code:</p>${codeBlock(code)}<p style="color:#666">The code expires in 30 minutes. If you didn't ask for this, ignore this email.</p>`,
    ),
  }),
};

const emailChanged: Record<Locale, (d: DataOf<'email-changed'>) => RenderedEmail> = {
  fr: ({ pseudo, newEmail }) => ({
    subject: 'Votre email Studybook a changé',
    text: `Bonjour ${pseudo},

L'email de votre compte Studybook est maintenant ${newEmail}. Si ce n'est pas vous, contactez tout de suite l'administrateur de votre serveur Studybook.`,
    html: layout(
      `<p>Bonjour ${escapeHtml(pseudo)},</p><p>L'email de votre compte Studybook est maintenant <strong>${escapeHtml(newEmail)}</strong>.</p><p>Si ce n'est pas vous, contactez tout de suite l'administrateur de votre serveur Studybook.</p>`,
    ),
  }),
  en: ({ pseudo, newEmail }) => ({
    subject: 'Your Studybook email was changed',
    text: `Hello ${pseudo},

Your Studybook account's email is now ${newEmail}. If this wasn't you, contact the administrator of your Studybook server right away.`,
    html: layout(
      `<p>Hello ${escapeHtml(pseudo)},</p><p>Your Studybook account's email is now <strong>${escapeHtml(newEmail)}</strong>.</p><p>If this wasn't you, contact the administrator of your Studybook server right away.</p>`,
    ),
  }),
};

function linkButton(link: string, label: string): string {
  return `<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">${escapeHtml(label)}</a></p>`;
}

function codeBlock(code: string): string {
  return `<p style="font-size:28px;font-weight:bold;letter-spacing:6px">${escapeHtml(code)}</p>`;
}

function layout(body: string): string {
  return `<!doctype html><html><body style="font-family:sans-serif;font-size:16px;line-height:1.5;color:#111;max-width:480px;margin:0 auto;padding:16px"><p style="font-weight:bold;font-size:20px">Studybook</p>${body}</body></html>`;
}

export function renderEmail(job: EmailJob): RenderedEmail {
  switch (job.template) {
    case 'verify-email':
      return verifyEmail[job.locale](job.data);
    case 'reset-password':
      return resetPassword[job.locale](job.data);
    case 'confirm-email-change':
      return confirmEmailChange[job.locale](job.data);
    case 'email-changed':
      return emailChanged[job.locale](job.data);
  }
}
