/**
 * Saving chat media to the phone. Photos and videos go to the photo library
 * (Photos / Gallery, write-only: the app never reads the library). Documents,
 * audio and voice notes open the share sheet, where "Save to Files", Drive,
 * Downloads and other apps are offered.
 */
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { MediaKind } from './render';

export type SaveResult = 'saved' | 'shared' | 'denied';

const EXT: Record<MediaKind, string> = { image: 'jpg', sticker: 'webp', video: 'mp4', audio: 'mp3', voice: 'ogg', document: 'bin' };
const MEDIA_EXT: Partial<Record<MediaKind, RegExp>> = { image: /\.(jpe?g|png|webp|gif|heic|heif)$/i, sticker: /\.webp$/i, video: /\.(mp4|mov|m4v|3gp)$/i };
const MIME_EXT: Record<string, string> = { 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/quicktime': 'mov', 'video/3gpp': '3gp' };

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/**
 * A file name for the download: the given one, else the link's last part, else `kind-time.ext`.
 * Photos and videos always end in a media extension: the photo library refuses anything else.
 */
const nameFor = (link: string, kind: MediaKind, filename?: string, mime?: string) => {
  const clean = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);
  const last = decode(link.split('?')[0].split('/').pop() ?? '');
  let name = clean(filename || (/\.[a-z0-9]{2,5}$/i.test(last) ? last : '') || `${kind}-${Date.now()}`);
  const media = MEDIA_EXT[kind];
  if (media && !media.test(name)) name = `${name.replace(/\.[a-z0-9]{2,5}$/i, '')}.${MIME_EXT[mime ?? ''] ?? EXT[kind]}`;
  else if (!media && !/\.[a-z0-9]{2,5}$/i.test(name)) name = `${name}.${EXT[kind]}`;
  return name;
};

const download = async (link: string, name: string) => {
  const dir = new Directory(Paths.cache, 'saved-media');
  dir.create({ idempotent: true, intermediates: true });
  return File.downloadFileAsync(link, new File(dir, name), { idempotent: true });
};

/** Downloads one media item and saves it (photos, videos) or shares it (everything else). */
export const saveMedia = async (link: string, kind: MediaKind, filename?: string, mime?: string): Promise<SaveResult> => {
  const file = await download(link, nameFor(link, kind, filename, mime));
  if (kind === 'image' || kind === 'video') {
    const perm = await requestPermissionsAsync(true);
    if (perm.status !== 'granted') return 'denied';
    await Asset.create(file.uri);
    return 'saved';
  }
  await Sharing.shareAsync(file.uri, mime ? { mimeType: mime } : undefined);
  return 'shared';
};

/** Several photos / videos at once (a gallery card). Returns how many were saved. */
export const saveAllMedia = async (items: { link: string; kind: MediaKind; filename?: string }[]): Promise<number | 'denied'> => {
  const perm = await requestPermissionsAsync(true);
  if (perm.status !== 'granted') return 'denied';
  let n = 0;
  for (const it of items) {
    const file = await download(it.link, nameFor(it.link, it.kind, it.filename));
    await Asset.create(file.uri);
    n += 1;
  }
  return n;
};
