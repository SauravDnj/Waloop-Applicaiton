import dayjs from 'dayjs';
import calendar from 'dayjs/plugin/calendar';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);
dayjs.extend(calendar);

export { dayjs };

/** `0:08`, `55:46`, `1:02:10`. */
export const formatDuration = (seconds: number): string => {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
};

/** `851h 5m`, `21h 4m`, `12m`. */
export const formatTalkTime = (seconds: number): string => {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${s}s`;
};

/** `Today · 3:51 PM`, `Yesterday · 9:52 AM`, `20 Sep · 5:01 PM`. */
export const formatWhen = (d: Date | string | number | null | undefined): string => {
  if (!d) return '';
  const t = dayjs(d);
  if (!t.isValid()) return '';
  return t.calendar(null, {
    sameDay: '[Today] · h:mm A',
    lastDay: '[Yesterday] · h:mm A',
    nextDay: '[Tomorrow] · h:mm A',
    lastWeek: 'D MMM · h:mm A',
    nextWeek: 'D MMM · h:mm A',
    sameElse: 'D MMM YY · h:mm A',
  });
};

export const formatDay = (d: Date | string | number) => dayjs(d).format('D MMM');

/**
 * The day chip over a chat's messages, as WhatsApp shows it: `Today`, `Yesterday`,
 * the weekday within the last week, else the date (with the year when not this one).
 */
export const chatDayLabel = (d: Date | number, labels: { today: string; yesterday: string }, locale?: string): string => {
  const day = dayjs(d).startOf('day');
  const diff = dayjs().startOf('day').diff(day, 'day');
  if (diff === 0) return labels.today;
  if (diff === 1) return labels.yesterday;
  const date = day.toDate();
  try {
    if (diff > 1 && diff < 7) return date.toLocaleDateString(locale, { weekday: 'long' });
    return date.toLocaleDateString(locale, { day: 'numeric', month: 'long', ...(day.year() === dayjs().year() ? {} : { year: 'numeric' }) });
  } catch {
    return day.format(day.year() === dayjs().year() ? 'dddd, D MMMM' : 'D MMMM YYYY');
  }
};

export const fromNow = (d: Date | string | number) => dayjs(d).fromNow();

export const isOverdue = (d: Date | null) => !!d && d.getTime() < Date.now();
/** The moment `days` days ago, in ms. */
export const daysAgo = (days: number) => Date.now() - days * 86400_000;
export const isToday = (d: Date | null) => !!d && dayjs(d).isSame(dayjs(), 'day');

export const startOfToday = () => dayjs().startOf('day').toDate();

/** The device's IANA zone, which the scheduler requires (never an offset). */
export const deviceTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};
