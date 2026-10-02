export function fmtTokens(n: number | undefined): string {
  if (!n) return '0';
  if (n < 1000) return String(n);
  return n >= 100_000 ? `${Math.round(n / 1000)}k` : `${(n / 1000).toFixed(1)}k`;
}

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export type SessionBucket = 'Today' | 'Yesterday' | 'This week' | 'Earlier';

export function bucketOf(ts: number, now = Date.now()): SessionBucket {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const t = startOfToday.getTime();
  if (ts >= t) return 'Today';
  if (ts >= t - 86_400_000) return 'Yesterday';
  if (ts >= t - 6 * 86_400_000) return 'This week';
  return 'Earlier';
}
