import { z } from 'zod';

export const FileKind = z.enum(['pdf', 'audio', 'video', 'image']);
export type FileKind = z.infer<typeof FileKind>;

const MB = 1024 * 1024;

/**
 * Maximum size per file kind (LIM-03). An instance can change them in
 * `instance_settings.upload_limits`, e.g. { "video": 524288000 }.
 */
export const DEFAULT_UPLOAD_LIMITS: Record<FileKind, number> = {
  image: 10 * MB,
  pdf: 25 * MB,
  audio: 50 * MB,
  video: 200 * MB,
};

/**
 * What each kind accepts, checked against the file's bytes, never its name.
 * Covers what phones in Cameroon usually produce (JPEG photos, WhatsApp voice notes, MP4 videos).
 */
export const ALLOWED_MIME_TYPES: Record<FileKind, readonly string[]> = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  pdf: ['application/pdf'],
  audio: ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/opus', 'audio/wav', 'audio/webm', 'audio/amr'],
  video: ['video/mp4', 'video/webm', 'video/quicktime', 'video/3gpp'],
};

/** Step 1 of an upload (design §5.5): say what is coming, so the size and quota are checked first. */
export const RequestUploadInput = z
  .object({
    kind: FileKind,
    sizeBytes: z.number().int().positive(),
    filename: z.string().trim().min(1).max(200),
  })
  .meta({ id: 'RequestUploadInput' });
export type RequestUploadInput = z.input<typeof RequestUploadInput>;

/** Where to send the bytes: `PUT` the file body to `uploadUrl` before `expiresAt`. */
export const UploadTicket = z
  .object({ fileId: z.string(), uploadUrl: z.string(), expiresAt: z.string() })
  .meta({ id: 'UploadTicket' });
export type UploadTicket = z.infer<typeof UploadTicket>;

export const FileView = z
  .object({
    id: z.string(),
    kind: FileKind,
    mime: z.string(),
    filename: z.string(),
    sizeBytes: z.number(),
    /** Protected: needs a session with access to the group */
    url: z.string(),
  })
  .meta({ id: 'FileView' });
export type FileView = z.infer<typeof FileView>;
