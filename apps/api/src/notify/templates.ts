import type { Locale } from '@studybook/shared';
import type { EmailJob } from './email-job.js';

export type RenderedEmail = { subject: string; text: string; html: string };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const verifyEmail: Record<Locale, (d: EmailJob['data']) => RenderedEmail> = {
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

function codeBlock(code: string): string {
  return `<p style="font-size:28px;font-weight:bold;letter-spacing:6px">${escapeHtml(code)}</p>`;
}

function layout(body: string): string {
  return `<!doctype html><html><body style="font-family:sans-serif;font-size:16px;line-height:1.5;color:#111;max-width:480px;margin:0 auto;padding:16px"><p style="font-weight:bold;font-size:20px">Studybook</p>${body}</body></html>`;
}

export function renderEmail(job: EmailJob): RenderedEmail {
  return verifyEmail[job.locale](job.data);
}
