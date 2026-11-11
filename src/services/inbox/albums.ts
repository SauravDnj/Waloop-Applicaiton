/**
 * Groups a thread's photos and videos into albums, as WhatsApp does: 4 or more
 * in a row, all sent (or all received) on one channel, with no caption and not
 * a reply, each within a few minutes of the one before, on the same day.
 */
import { renderContent } from './render';
import type { ChatMessage } from './store';

export type ThreadRow = { kind: 'msg'; key: string; m: ChatMessage } | { kind: 'album'; key: string; items: ChatMessage[] };

/** Fewer than this stay separate bubbles. */
export const ALBUM_MIN = 4;
const MAX_GAP_S = 5 * 60;

/** A row's list key: a sent message keeps the key of the bubble it replaced. */
const keyOf = (m: ChatMessage) => m.localKey ?? m.id;

export const isMine = (m: ChatMessage) => m.direction === 'outbound' || m.status !== 'received';

const albumable = (m: ChatMessage) => {
  if (m.status === 'failed') return false;
  const ctx = (m.context ?? {}) as { id?: string; message_id?: string };
  if (ctx.id || ctx.message_id) return false;
  const r = renderContent(m.content);
  return r.kind === 'media' && (r.media === 'image' || r.media === 'video') && !!r.link && !r.caption.trim();
};

const sameDay = (a: number, b: number) => new Date(a * 1000).toDateString() === new Date(b * 1000).toDateString();

/** Rows in thread order (oldest first): single messages, and albums of `ALBUM_MIN`+ items. */
export const groupAlbums = (thread: ChatMessage[]): ThreadRow[] => {
  const rows: ThreadRow[] = [];
  let run: ChatMessage[] = [];
  const flush = () => {
    if (run.length >= ALBUM_MIN) rows.push({ kind: 'album', key: `album:${keyOf(run[0])}`, items: run });
    else for (const m of run) rows.push({ kind: 'msg', key: keyOf(m), m });
    run = [];
  };
  for (const m of thread) {
    if (!albumable(m)) {
      flush();
      rows.push({ kind: 'msg', key: keyOf(m), m });
      continue;
    }
    const prev = run[run.length - 1];
    if (prev && (isMine(prev) !== isMine(m) || prev.channel !== m.channel || m.timestamp - prev.timestamp > MAX_GAP_S || !sameDay(prev.timestamp, m.timestamp)))
      flush();
    run.push(m);
  }
  flush();
  return rows;
};

/** The messages a row stands for. */
export const rowMessages = (row: ThreadRow): ChatMessage[] => (row.kind === 'album' ? row.items : [row.m]);
/** A row's time: an album's is its newest item's. */
export const rowTime = (row: ThreadRow) => (row.kind === 'album' ? row.items[row.items.length - 1].timestamp : row.m.timestamp);
