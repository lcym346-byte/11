export function toMillis(value: unknown): number {
  if (typeof value === 'number') return value;

  if (value && typeof value === 'object' && 'seconds' in value) {
    const ts = value as { seconds: number; nanoseconds?: number };
    return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1_000_000);
  }

  return 0;
}

export function sortByCreatedAtDesc<T extends { createdAt?: unknown }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

export function formatDateTime(value: unknown): string {
  const ms = toMillis(value);
  if (!ms) return '-';
  return new Date(ms).toLocaleString();
}

export function isToday(value: unknown): boolean {
  const ms = toMillis(value);
  if (!ms) return false;

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = start + 24 * 60 * 60 * 1000;
  return ms >= start && ms < end;
}
