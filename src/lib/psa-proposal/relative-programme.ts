/** Proposal-owned display instructions. Never changes the quote Gantt or fees. */
export interface RelativeProgrammeRow {
  stageId: string;
  label: string;
  unit: "week" | "constructionMonth";
  start: number;
  end: number;
  durationLabel: string;
}

export function relativeProgrammeRows(value: unknown): RelativeProgrammeRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is RelativeProgrammeRow => {
    if (!row || typeof row !== "object") return false;
    return typeof row.stageId === "string" && typeof row.label === "string" &&
      (row.unit === "week" || row.unit === "constructionMonth") &&
      Number.isInteger(row.start) && Number.isInteger(row.end) &&
      row.start >= 1 && row.end >= row.start && typeof row.durationLabel === "string";
  });
}

export function relativeProgrammeTiming(row: RelativeProgrammeRow, lang: string): string {
  const range = row.start === row.end ? `${row.start}` : `${row.start}–${row.end}`;
  if (row.unit === "constructionMonth") {
    return lang === "en" ? `Construction month ${range}` : `Mês ${range} de obra`;
  }
  return lang === "en" ? `Week ${range}` : `Semana ${range}`;
}