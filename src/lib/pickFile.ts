/**
 * Picks a file from the phone's photo library or document library (or the
 * browser's file chooser on the web). Returns null when the user cancels.
 */
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import type { PickedFile } from '@/services/crm/whatsapp';

export type PickKind = 'image' | 'video' | 'document';

const ACCEPT: Record<PickKind, string[]> = {
  image: ['image/jpeg', 'image/png'],
  video: ['video/mp4', 'video/3gpp'],
  document: ['application/pdf', '*/*'],
};

export const pickFromGallery = async (kind: 'image' | 'video'): Promise<PickedFile | null> => {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted && perm.accessPrivileges !== 'limited') return null;
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: kind === 'image' ? ['images'] : ['videos'],
    quality: 0.85,
    allowsEditing: false,
  });
  const a = res.canceled ? null : res.assets[0];
  if (!a) return null;
  const ext = kind === 'image' ? 'jpg' : 'mp4';
  return {
    uri: a.uri,
    name: a.fileName || `${kind}-${Date.now()}.${ext}`,
    mimeType: a.mimeType || (kind === 'image' ? 'image/jpeg' : 'video/mp4'),
    size: a.fileSize ?? 0,
    file: (a as { file?: Blob }).file,
  };
};

export const pickDocument = async (kind: PickKind = 'document'): Promise<PickedFile | null> => {
  const res = await DocumentPicker.getDocumentAsync({ type: ACCEPT[kind], copyToCacheDirectory: true, multiple: false });
  const a = res.canceled ? null : res.assets[0];
  if (!a) return null;
  return { uri: a.uri, name: a.name, mimeType: a.mimeType || 'application/octet-stream', size: a.size ?? 0, file: a.file };
};

/** Gallery for photos and videos, document library for documents. */
export const pickForFormat = (format: 'IMAGE' | 'VIDEO' | 'DOCUMENT') =>
  format === 'DOCUMENT' ? pickDocument('document') : pickFromGallery(format === 'IMAGE' ? 'image' : 'video');

export const MAX_BYTES: Record<'IMAGE' | 'VIDEO' | 'DOCUMENT', number> = { IMAGE: 5 * 1024 * 1024, VIDEO: 16 * 1024 * 1024, DOCUMENT: 100 * 1024 * 1024 };
