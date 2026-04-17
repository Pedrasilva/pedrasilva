// Conta dias úteis (seg-sex) entre duas datas inclusive (ISO yyyy-mm-dd)
export function countWeekdays(startISO: string, endISO: string): number {
  if (!startISO || !endISO) return 0;
  const start = new Date(startISO + "T00:00:00");
  const end = new Date(endISO + "T00:00:00");
  if (end < start) return 0;
  let days = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) days++;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}
