import { z } from 'zod';
import { Locale } from './instance.js';

/** Bump when the privacy policy text changes, so we know what each user agreed to (NFR-07). */
export const PRIVACY_POLICY_VERSION = '2026-10-13';

/** 3 to 30 letters, digits, `_`, `.` or `-`. Unique ignoring case. */
export const Pseudo = z
  .string()
  .trim()
  .regex(/^[\p{L}\p{N}_.-]{3,30}$/u);

export const Email = z.string().trim().toLowerCase().max(254).pipe(z.email());

/**
 * Cameroon phone number, accepted as typed (`6 77 12 34 56`, `+237 677…`,
 * `00237…`) and normalised to E.164: `+237` then 9 digits starting with 2 or 6.
 */
export const CameroonPhone = z
  .string()
  .transform((value) => {
    const digits = value.replace(/[\s.\-()]/g, '');
    if (/^\d{9}$/.test(digits)) return `+237${digits}`;
    if (/^00237\d{9}$/.test(digits)) return `+${digits.slice(2)}`;
    if (/^237\d{9}$/.test(digits)) return `+${digits}`;
    return digits;
  })
  .pipe(z.string().regex(/^\+237[26]\d{8}$/));

/** At least 8 characters (ACC-01). Capped so hashing stays cheap. */
export const Password = z.string().min(8).max(128);

export const SignUpInput = z
  .object({
    fullName: z.string().trim().min(2).max(100),
    pseudo: Pseudo,
    email: Email,
    phone: CameroonPhone,
    password: Password,
    locale: Locale,
    acceptPrivacy: z.literal(true),
  })
  .meta({ id: 'SignUpInput' });
export type SignUpInput = z.input<typeof SignUpInput>;

export const SignUpResult = z.object({ email: z.string() }).meta({ id: 'SignUpResult' });
export type SignUpResult = z.infer<typeof SignUpResult>;

export const VerifyEmailInput = z
  .object({
    email: Email,
    code: z.string().regex(/^\d{6}$/),
  })
  .meta({ id: 'VerifyEmailInput' });
export type VerifyEmailInput = z.input<typeof VerifyEmailInput>;

export const VerifyEmailResult = z.object({ status: z.literal('verified') }).meta({ id: 'VerifyEmailResult' });
export type VerifyEmailResult = z.infer<typeof VerifyEmailResult>;

export const ResendVerificationInput = z.object({ email: Email }).meta({ id: 'ResendVerificationInput' });
export type ResendVerificationInput = z.input<typeof ResendVerificationInput>;
