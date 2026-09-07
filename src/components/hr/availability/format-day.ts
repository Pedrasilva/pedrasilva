/** Readable day labels for the availability views (no new deps). */
export function formatDayLabel(iso: string, locale?: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(new Date(y, m - 1, d));
}
