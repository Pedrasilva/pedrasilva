export function formatHM(hours: number): string {
  if (!hours || hours <= 0) return "";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h${m.toString().padStart(2, "0")}`;
}

export function parseHM(input: string): number | null {
  const s = input.trim().toLowerCase().replace(",", ".");
  if (s === "") return 0;

  const minutesOnly = s.match(/^(\d+)\s*m$/);
  if (minutesOnly) {
    return Number(minutesOnly[1]) / 60;
  }

  const hm = s.match(/^(\d+)\s*[h:]\s*(\d{0,2})$/);
  if (hm) {
    const h = Number(hm[1]);
    const m = hm[2] === "" ? 0 : Number(hm[2]);
    if (m >= 60) return null;
    return h + m / 60;
  }

  if (/^\d+(\.\d+)?$/.test(s)) {
    return Number(s);
  }

  return null;
}
