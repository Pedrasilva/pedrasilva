// Conta dias úteis (seg-sex) entre duas datas inclusive (ISO yyyy-mm-dd),
// excluindo opcionalmente um conjunto de feriados (ISO yyyy-mm-dd).
export function countWeekdays(
  startISO: string,
  endISO: string,
  holidayDates: Set<string> | string[] = new Set(),
): number {
  if (!startISO || !endISO) return 0;
  const holidays =
    holidayDates instanceof Set ? holidayDates : new Set(holidayDates);
  const start = new Date(startISO + "T00:00:00");
  const end = new Date(endISO + "T00:00:00");
  if (end < start) return 0;
  let days = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const d = cur.getDay();
    const iso = cur.toISOString().slice(0, 10);
    if (d !== 0 && d !== 6 && !holidays.has(iso)) days++;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}
