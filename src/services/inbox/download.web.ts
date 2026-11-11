/** Web: the browser downloads the file (fetched first, so a cross-origin link still saves rather than opens). */
import type { MediaKind } from './render';

export type SaveResult = 'saved' | 'shared' | 'denied';

const nameFor = (link: string, kind: MediaKind, filename?: string) =>
  filename || decodeURIComponent(link.split('?')[0].split('/').pop() ?? '') || `${kind}-${Date.now()}`;

const browserDownload = async (link: string, name: string) => {
  let href = link;
  try {
    const res = await fetch(link);
    if (res.ok) href = URL.createObjectURL(await res.blob());
  } catch {
    // No CORS on the media host: let the browser fetch it itself.
  }
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (href !== link) setTimeout(() => URL.revokeObjectURL(href), 10_000);
};

export const saveMedia = async (link: string, kind: MediaKind, filename?: string, _mime?: string): Promise<SaveResult> => {
  await browserDownload(link, nameFor(link, kind, filename));
  return 'saved';
};

export const saveAllMedia = async (items: { link: string; kind: MediaKind; filename?: string }[]): Promise<number | 'denied'> => {
  for (const it of items) await browserDownload(it.link, nameFor(it.link, it.kind, it.filename));
  return items.length;
};
