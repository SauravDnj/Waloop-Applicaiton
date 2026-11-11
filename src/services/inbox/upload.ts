/**
 * Uploads a file for a WhatsApp send and returns its permanent link.
 *
 * CPaaS hands out a presigned URL whose signature covers the exact byte size
 * and content type, so both must match what is sent. On phones the size is
 * read from the file on disk (a picker's reported size can differ, e.g. after
 * converting to JPEG) and the bytes are sent natively by the file system,
 * not through a JS Blob, which React Native can send empty or mistyped.
 * A `content://` file (shared from another Android app) is copied first.
 */
import type { MediaKind } from '@ab-ecosystem/cpaas';
import { Directory, File, Paths } from 'expo-file-system';
import { FileSystemUploadType, uploadAsync } from 'expo-file-system/legacy';

import { crmFor } from '@/services/crm/client';

export type UploadSource = { uri: string; name: string; mimeType: string; size: number; file?: Blob };

/** A local `file://` copy of the file (shared content and picks are not always one). */
const localFile = (f: UploadSource): File => {
  const file = new File(f.uri);
  if (f.uri.startsWith('file:')) return file;
  const dir = new Directory(Paths.cache, 'uploads');
  dir.create({ idempotent: true, intermediates: true });
  const copy = new File(dir, `${Date.now()}-${f.name.replace(/[\\/:*?"<>|]+/g, '_')}`);
  file.copy(copy);
  return copy;
};

export const uploadMedia = async (acct: string | null | undefined, kind: MediaKind, f: UploadSource): Promise<string> => {
  const file = localFile(f);
  const size = file.size ?? f.size;
  if (!size) throw new Error(`Could not read "${f.name}" (empty file).`);
  const contentType = f.mimeType || 'application/octet-stream';
  const ticket = await crmFor(acct).inboxMedia.createUpload({ kind, filename: f.name, content_type: contentType, size });
  const res = await uploadAsync(ticket.upload_url, file.uri, {
    httpMethod: 'PUT',
    uploadType: FileSystemUploadType.BINARY_CONTENT,
    // Exactly the signed headers: anything else fails the signature.
    headers: ticket.headers,
  });
  if (res.status < 200 || res.status >= 300) throw new Error(`Upload to storage failed (${res.status}). ${(res.body ?? '').slice(0, 200)}`);
  return ticket.link;
};
