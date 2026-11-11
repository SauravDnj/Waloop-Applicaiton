/**
 * Attachments for the WhatsApp inbox: pick several at once, normalise them to
 * what Meta accepts, and refuse what it would reject, at pick time, with the
 * reason. Limits are WhatsApp's own: image 5 MB, video 16 MB, audio 16 MB,
 * document 100 MB.
 */
import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import type { PickedFile } from '@/services/crm/whatsapp';

export type SendKind = 'image' | 'video' | 'audio' | 'document';

export const LIMIT_MB: Record<SendKind, number> = { image: 5, video: 16, audio: 16, document: 100 };
const MB = 1024 * 1024;

const IMAGE_OK = ['image/jpeg', 'image/png'];
const VIDEO_OK = ['video/mp4', 'video/3gpp', 'video/quicktime'];
const AUDIO_OK = ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg', 'audio/x-m4a', 'audio/m4a'];
const DOC_BLOCKED = ['text/html', 'image/svg+xml', 'application/javascript', 'text/javascript'];

export type Prepared = PickedFile & { kind: SendKind; caption: string; converted?: boolean };
export type Rejected = { name: string; reason: 'tooLarge' | 'format'; kind: SendKind; limitMb?: number };

const kindOf = (mime: string): SendKind =>
  mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'document';

const sizeOf = async (f: PickedFile): Promise<number> => {
  if (f.size) return f.size;
  try {
    return (await (await fetch(f.uri)).blob()).size;
  } catch {
    return 0;
  }
};

/** Re-encodes an image as JPEG (any format Meta refuses, or to bring it under 5 MB). */
const toJpeg = async (f: PickedFile, compress: number): Promise<PickedFile> => {
  const rendered = await ImageManipulator.manipulate(f.uri).renderAsync();
  const out = await rendered.saveAsync({ format: SaveFormat.JPEG, compress });
  const next: PickedFile = { uri: out.uri, name: f.name.replace(/\.[^.]+$/, '') + '.jpg', mimeType: 'image/jpeg', size: 0 };
  return { ...next, size: await sizeOf(next) };
};

/** Normalises one file, or says why it cannot be sent. */
export const prepare = async (f: PickedFile): Promise<Prepared | Rejected> => {
  const mime = (f.mimeType || '').toLowerCase();
  const kind = kindOf(mime);
  let file: PickedFile = { ...f, size: await sizeOf(f) };
  let converted = false;

  if (kind === 'image') {
    if (!IMAGE_OK.includes(mime)) {
      file = await toJpeg(file, 0.9);
      converted = true;
    }
    if (file.size > LIMIT_MB.image * MB) {
      // One quality pass before giving up; most phone photos fit after it.
      const smaller = await toJpeg(file, 0.7);
      if (smaller.size <= LIMIT_MB.image * MB) {
        file = smaller;
        converted = true;
      }
    }
  } else if (kind === 'video' && !VIDEO_OK.includes(mime)) {
    return { name: f.name, reason: 'format', kind };
  } else if (kind === 'audio' && !AUDIO_OK.includes(mime)) {
    return { name: f.name, reason: 'format', kind };
  } else if (kind === 'document' && DOC_BLOCKED.includes(mime)) {
    return { name: f.name, reason: 'format', kind };
  }

  if (file.size > LIMIT_MB[kind] * MB) return { name: f.name, reason: 'tooLarge', kind, limitMb: LIMIT_MB[kind] };
  return { ...file, kind, caption: '', converted };
};

/** WhatsApp's sticker rules: WebP, exactly 512×512, at most 100 KB. */
export const STICKER_SIZE = 512;
export const STICKER_MAX_BYTES = 100 * 1024;

/**
 * Turns a picked image into a sticker. A WebP that already fits (an animated one too) goes
 * as it is; anything else is cropped to its centre square, scaled to 512×512 and saved as
 * WebP, smaller each pass until it is under 100 KB. Null when it can't be made to fit.
 */
export const prepareSticker = async (f: PickedFile): Promise<PickedFile | null> => {
  const mime = (f.mimeType || '').toLowerCase();
  if (!mime.startsWith('image/')) return null;
  const size = await sizeOf(f);
  const base = f.name.replace(/\.[^.]+$/, '') || `sticker-${Date.now()}`;
  const original = await ImageManipulator.manipulate(f.uri).renderAsync();
  if (mime === 'image/webp' && size && size <= STICKER_MAX_BYTES && original.width === STICKER_SIZE && original.height === STICKER_SIZE) return { ...f, size };
  const side = Math.min(original.width, original.height);
  for (const compress of [0.85, 0.6, 0.4, 0.2]) {
    const square = await ImageManipulator.manipulate(f.uri)
      .crop({ originX: Math.floor((original.width - side) / 2), originY: Math.floor((original.height - side) / 2), width: side, height: side })
      .resize({ width: STICKER_SIZE, height: STICKER_SIZE })
      .renderAsync();
    const out = await square.saveAsync({ format: SaveFormat.WEBP, compress });
    const next: PickedFile = { uri: out.uri, name: `${base}.webp`, mimeType: 'image/webp', size: 0 };
    next.size = await sizeOf(next);
    if (next.size && next.size <= STICKER_MAX_BYTES) return next;
  }
  return null;
};

/** One image for a sticker: from the gallery, else (web) the file picker. */
export const pickStickerImage = async (): Promise<PickedFile | null> => {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted && perm.accessPrivileges !== 'limited') return null;
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
  if (res.canceled) return null;
  const a = res.assets[0];
  return {
    uri: a.uri,
    name: a.fileName || `sticker-${Date.now()}.png`,
    mimeType: a.mimeType || 'image/png',
    size: a.fileSize ?? 0,
    file: (a as { file?: Blob }).file,
  };
};

export const prepareAll = async (files: PickedFile[]) => {
  const results = await Promise.all(files.map((f) => prepare(f).catch((): Rejected => ({ name: f.name, reason: 'format', kind: kindOf(f.mimeType) }))));
  return {
    accepted: results.filter((r): r is Prepared => 'uri' in r),
    rejected: results.filter((r): r is Rejected => 'reason' in r),
  };
};

/** Photos and videos from the gallery, several at once. */
export const pickGallery = async (): Promise<PickedFile[]> => {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted && perm.accessPrivileges !== 'limited') return [];
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, selectionLimit: 10, quality: 1 });
  if (res.canceled) return [];
  return res.assets.map((a, i) => ({
    uri: a.uri,
    name: a.fileName || `${a.type === 'video' ? 'video' : 'photo'}-${Date.now()}-${i}.${a.type === 'video' ? 'mp4' : 'jpg'}`,
    mimeType: a.mimeType || (a.type === 'video' ? 'video/mp4' : 'image/jpeg'),
    size: a.fileSize ?? 0,
    file: (a as { file?: Blob }).file,
  }));
};

/** Photo from the camera. */
export const pickCamera = async (): Promise<PickedFile[]> => {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return [];
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
  if (res.canceled) return [];
  const a = res.assets[0];
  return [{ uri: a.uri, name: a.fileName || `photo-${Date.now()}.jpg`, mimeType: a.mimeType || 'image/jpeg', size: a.fileSize ?? 0 }];
};

/** Any files (documents, audio, also media) from the file picker, several at once. */
export const pickFiles = async (): Promise<PickedFile[]> => {
  const res = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
  if (res.canceled) return [];
  return res.assets.map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType || 'application/octet-stream', size: a.size ?? 0, file: a.file }));
};
