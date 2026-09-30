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

/** Neutral hatch for days before a person's admission date. */
export const PRE_ADMISSION_BG = `repeating-linear-gradient(45deg, ${mix("var(--muted-foreground)", 22)} 0 1px, transparent 1px 5px)`;

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
    case "remote": {
      const remote = mix("var(--hr-accent)", 16);
      // Half-day remote: the other half is worked from the office. Capacity is
      // unchanged — only the shading tells where the person is.
      if (cell.dayPart === "morning")
        return { background: `linear-gradient(to right, ${remote} 50%, transparent 50%)` };
      if (cell.dayPart === "afternoon")
        return { background: `linear-gradient(to right, transparent 50%, ${remote} 50%)` };
      return { background: remote };
    }
    case "holiday":
      return { background: mix("var(--ink)", 14) };
    case "weekend":
      return { background: mix("var(--ink)", 9) };
    case "pre-admission":
      return { background: PRE_ADMISSION_BG };
    default:
      return {};
  }
}

export function coverageTone(pct: number): string {
  if (pct >= 80) return "var(--positive)";
  if (pct >= 60) return "var(--hr-accent)";
  return "var(--negative)";
}
