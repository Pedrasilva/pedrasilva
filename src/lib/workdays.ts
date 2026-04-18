// Cálculo de dias úteis para um ano civil, alinhado com https://www.dias-uteis.pt
// Lógica: dias do ano − fins-de-semana (sáb/dom) − feriados nacionais que caem em dia útil.
// Os dias de férias do colaborador são individuais e descontados separadamente.

export type Holiday = {
  id: string;
  data: string; // ISO yyyy-mm-dd
  nome: string;
  tipo: string;
};

export type WorkdaysBreakdown = {
  ano: number;
  diasAno: number;
  fimDeSemana: number;
  feriadosTotais: number;
  feriadosUteis: number;
  feriadosFimDeSemana: number;
  diasUteisBase: number; // sem descontar férias
  diasUteisLiquidos: (diasFerias: number) => number;
  feriadosDetalhe: Array<Holiday & { weekday: number; emDiaUtil: boolean }>;
};

const PT_WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export function weekdayName(d: number): string {
  return PT_WEEKDAYS[d] ?? "—";
}

export function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInYear(year: number): number {
  return isLeap(year) ? 366 : 365;
}

export function countWeekendDaysInYear(year: number): number {
  let count = 0;
  const cur = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31));
  while (cur <= end) {
    const d = cur.getUTCDay();
    if (d === 0 || d === 6) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

export function computeWorkdays(year: number, holidays: Holiday[]): WorkdaysBreakdown {
  const yearHolidays = holidays.filter((h) => h.data.startsWith(String(year)));
  const detalhe = yearHolidays
    .map((h) => {
      const dt = new Date(h.data + "T00:00:00Z");
      const weekday = dt.getUTCDay();
      const emDiaUtil = weekday !== 0 && weekday !== 6;
      return { ...h, weekday, emDiaUtil };
    })
    .sort((a, b) => a.data.localeCompare(b.data));

  const feriadosUteis = detalhe.filter((h) => h.emDiaUtil).length;
  const feriadosFimDeSemana = detalhe.length - feriadosUteis;
  const diasAno = daysInYear(year);
  const fimDeSemana = countWeekendDaysInYear(year);
  const diasUteisBase = diasAno - fimDeSemana - feriadosUteis;

  return {
    ano: year,
    diasAno,
    fimDeSemana,
    feriadosTotais: detalhe.length,
    feriadosUteis,
    feriadosFimDeSemana,
    diasUteisBase,
    diasUteisLiquidos: (diasFerias: number) =>
      Math.max(0, diasUteisBase - (diasFerias || 0)),
    feriadosDetalhe: detalhe,
  };
}
