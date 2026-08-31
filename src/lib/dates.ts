// Converte uma Date para ISO yyyy-mm-dd usando o calendário LOCAL.
// Nunca usar toISOString() para isto: em fusos a leste de UTC (ex.: Lisboa
// no horário de verão) a meia-noite local recua um dia em UTC.
export function toLocalISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

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
  const toLocalISO = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  while (cur <= end) {
    const d = cur.getDay();
    const iso = toLocalISO(cur);
    if (d !== 0 && d !== 6 && !holidays.has(iso)) days++;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}
