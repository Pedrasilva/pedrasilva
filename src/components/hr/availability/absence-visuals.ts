/**
 * Shared visual language for the team availability grid.
 * Colours come from the existing HR/warm design tokens — no new palette.
 */
import type { AbsenceType, Cell } from "@/lib/hr/use-team-availability";

/** Holiday ("férias") reads sage; every other authorised absence reads clay. */
export function absenceToken(tipo?: AbsenceType): string {
  return tipo === "ferias" ? "var(--sage)" : "var(--clay)";
}

export function mix(token: string, pct: number): string {
  return `color-mix(in oklch, ${token} ${pct}%, transparent)`;
}

/** Inline background for one person/day cell. */
export function cellStyle(cell: Cell | undefined): React.CSSProperties {
  if (!cell) return {};
  const token = absenceToken(cell.tipo);
  switch (cell.kind) {
    case "absent":
      return { background: mix(token, 70) };
    case "absent-half": {
      const solid = mix(token, 70);
      return cell.periodo === "tarde"
        ? { background: `linear-gradient(to right, transparent 50%, ${solid} 50%)` }
        : { background: `linear-gradient(to right, ${solid} 50%, transparent 50%)` };
    }
    case "pending":
      return {
        background: `repeating-linear-gradient(135deg, ${mix(token, 45)} 0 4px, transparent 4px 8px)`,
      };
    case "remote":
      return { background: mix("var(--hr-accent)", 16) };
    case "holiday":
      return { background: mix("var(--ink)", 10) };
    case "weekend":
      return { background: mix("var(--ink)", 6) };
    default:
      return {};
  }
}

export function coverageTone(pct: number): string {
  if (pct >= 80) return "var(--positive)";
  if (pct >= 60) return "var(--hr-accent)";
  return "var(--negative)";
}
