/** Web: the browser's `File` / `Blob` goes up as is (its size and type are exact). */
import type { MediaKind } from '@ab-ecosystem/cpaas';

import { crmFor } from '@/services/crm/client';

export type UploadSource = { uri: string; name: string; mimeType: string; size: number; file?: Blob };

export const uploadMedia = async (acct: string | null | undefined, kind: MediaKind, f: UploadSource): Promise<string> => {
  const body = f.file ?? (await (await fetch(f.uri)).blob());
  return crmFor(acct).inboxMedia.upload({ body, filename: f.name, contentType: f.mimeType || body.type || 'application/octet-stream', size: body.size }, { kind });
};
