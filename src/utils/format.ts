import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import isoWeek from 'dayjs/plugin/isoWeek';

dayjs.extend(relativeTime);
dayjs.extend(customParseFormat);
dayjs.extend(isoWeek);

export const formatDate = (value?: string | null, fmt = 'MMM D, YYYY') => (value ? dayjs(value).format(fmt) : '—');
export const formatDateTime = (value?: string | null) => (value ? dayjs(value).format('MMM D, YYYY · h:mm A') : '—');
export const formatTime = (value?: string | null) => {
  if (!value) return '—';
  const d = value.length <= 5 ? dayjs(`2000-01-01T${value}`) : dayjs(value);
  return d.isValid() ? d.format('h:mm A') : value;
};
export const fromNow = (value?: string | null) => (value ? dayjs(value).fromNow() : '—');
export const formatCurrency = (value: number, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
export const formatNumber = (value: number) => new Intl.NumberFormat('en-US').format(value);
export const formatPercent = (value: number, digits = 0) => `${value.toFixed(digits)}%`;
export const initials = (name: string) =>
  name
    .replace(/^Dr\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join('');
export const formatFileSize = (kb: number) => (kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`);
export const titleCase = (s: string) => s.replace(/(^|\s|-)([a-z])/g, (m) => m.toUpperCase());

/** Stable color for an arbitrary string (avatars). */
export const hashColor = (input: string) => {
  const palette = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#0f6e8c'];
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
};

export { dayjs };
