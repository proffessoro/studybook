import type { FileKind, FileView } from '@studybook/shared';
import type { ApiError } from '@studybook/api-client';
import { api } from '@/lib/api';

export type UploadResult = { file: FileView } | { error: ApiError | 'network' | 'aborted' };

export type UploadOptions = {
  /** Share of the bytes sent so far, from 0 to 1 */
  onProgress?: (fraction: number) => void;
  /** Aborting stops the upload and gives the reserved bytes back to the group */
  signal?: AbortSignal;
};

/**
 * Uploads a file in the two steps of design §5.5: announce it (size and quota
 * checked, bytes reserved), then send the bytes as the raw request body.
 * The bytes go with XMLHttpRequest because `fetch` can't report upload
 * progress, which matters for a large video on a slow connection.
 */
export async function uploadFile(groupId: string, file: File, kind: FileKind, options: UploadOptions = {}): Promise<UploadResult> {
  const { onProgress, signal } = options;
  try {
    const { data: ticket, error } = await api.POST('/api/v1/groups/{groupId}/uploads', {
      params: { path: { groupId } },
      body: { kind, sizeBytes: file.size, filename: file.name },
    });
    if (!ticket) return { error: error ?? 'network' };
    if (signal?.aborted) {
      await release(ticket.fileId);
      return { error: 'aborted' };
    }

    const result = await new Promise<UploadResult>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', ticket.uploadUrl);
      xhr.setRequestHeader('content-type', 'application/octet-stream');
      xhr.responseType = 'json';
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(event.loaded / event.total);
      };
      xhr.onload = () => {
        const body = xhr.response as FileView | ApiError | null;
        if (!body) resolve({ error: 'network' });
        else resolve(xhr.status >= 200 && xhr.status < 300 ? { file: body as FileView } : { error: body as ApiError });
      };
      xhr.onerror = () => resolve({ error: 'network' });
      xhr.onabort = () => resolve({ error: 'aborted' });
      signal?.addEventListener('abort', () => xhr.abort(), { once: true });
      xhr.send(file);
    });
    if ('error' in result && result.error === 'aborted') await release(ticket.fileId);
    return result;
  } catch {
    return { error: 'network' };
  }
}

/** Gives the reserved bytes back now rather than when the reservation expires. */
async function release(fileId: string) {
  await api.DELETE('/api/v1/files/{fileId}', { params: { path: { fileId } } }).catch(() => undefined);
}
