import type { FileKind, FileView } from '@studybook/shared';
import type { ApiError } from '@studybook/api-client';
import { api } from '@/lib/api';

export type UploadResult = { file: FileView } | { error: ApiError | 'network' };

/**
 * Uploads a file in the two steps of design §5.5: announce it (size and quota
 * checked, bytes reserved), then send the bytes as the raw request body.
 */
export async function uploadFile(groupId: string, file: File, kind: FileKind): Promise<UploadResult> {
  try {
    const { data: ticket, error } = await api.POST('/api/v1/groups/{groupId}/uploads', {
      params: { path: { groupId } },
      body: { kind, sizeBytes: file.size, filename: file.name },
    });
    if (!ticket) return { error: error ?? 'network' };

    const res = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'application/octet-stream' },
      body: file,
    });
    const body = (await res.json()) as FileView | ApiError;
    return res.ok ? { file: body as FileView } : { error: body as ApiError };
  } catch {
    return { error: 'network' };
  }
}
