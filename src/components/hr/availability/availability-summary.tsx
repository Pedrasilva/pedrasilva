import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import type {
  AvailabilityPerson,
  Cell,
  Coverage,
  DayColumn,
} from "@/lib/hr/use-team-availability";
import { coverageTone } from "./absence-visuals";
import { formatDayLabel } from "./format-day";

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold" style={tone ? { color: tone } : undefined}>
          {value}
        </div>
        {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

export function AvailabilitySummary({
  people,
  days,
  cells,
  coverage,
  canSeeDetail,
  todayISO,
}: {
  people: AvailabilityPerson[];
  days: DayColumn[];
  cells: Record<string, Record<string, Cell>>;
  coverage: Coverage[];
  canSeeDetail: boolean;
  todayISO: string;
}) {
  const { t } = useTranslation("hr");
  const pool = people.filter((p) => p.includeInPlanning);

  const awayToday = pool.filter((p) => {
    const k = cells[p.id]?.[todayISO]?.kind;
    return k === "absent" || k === "absent-half";
  });
  const remoteToday = pool.filter((p) => cells[p.id]?.[todayISO]?.kind === "remote");
  const todayInMonth = days.some((d) => d.iso === todayISO);
  const availableToday = pool.length - awayToday.length;

  // Next planned absence (from today onwards, within the visible month).
  let next: { name: string; iso: string; label: string } | null = null;
  for (const d of days) {
    if (d.iso <= todayISO || !d.isWorkingDay) continue;
    for (const p of pool) {
      const cell = cells[p.id]?.[d.iso];
      if (cell?.kind === "absent" || cell?.kind === "absent-half") {
        next = {
          name: p.nome,
          iso: d.iso,
          label: canSeeDetail
            ? t(`availability.types.${cell.tipo}`)
            : cell.tipo === "ferias"
              ? t("availability.state.holiday")
              : t("availability.state.unavailable"),
        };
        break;
      }
    }
    if (next) break;
  }

  const upcoming = coverage.filter((c) => c.iso >= todayISO && c.total > 0);
  const lowest = upcoming.reduce<Coverage | null>(
    (min, c) => (!min || c.pct < min.pct ? c : min),
    null,
  );

  const clashDays = coverage.filter((c) => c.clashes.length > 0 && c.iso >= todayISO);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("availability.cards.availableToday")}
          value={todayInMonth ? `${availableToday}/${pool.length}` : "—"}
          hint={
            todayInMonth && remoteToday.length
              ? t("availability.cards.includesRemote", { count: remoteToday.length })
              : undefined
          }
        />
        <StatCard
          label={t("availability.cards.awayToday")}
          value={todayInMonth ? String(awayToday.length) : "—"}
          hint={todayInMonth ? awayToday.map((p) => p.nome).join(", ") || undefined : undefined}
        />
        <StatCard
          label={t("availability.cards.nextAbsence")}
          value={next ? next.name : "—"}
          hint={next ? `${formatDayLabel(next.iso)} · ${next.label}` : t("availability.cards.noneThisMonth")}
        />
        <StatCard
          label={t("availability.cards.lowestCoverage")}
          value={lowest ? `${Math.round(lowest.pct)}%` : "—"}
          hint={lowest ? formatDayLabel(lowest.iso) : undefined}
          tone={lowest ? coverageTone(lowest.pct) : undefined}
        />
      </div>

      {clashDays.length > 0 ? (
        <div
          className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--hr-accent)" }}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--hr-accent)]" />
          <span className="text-muted-foreground">
            {t("availability.warnings.overlap", {
              count: clashDays.length,
              first: formatDayLabel(clashDays[0]!.iso),
            })}
          </span>
        </div>
      ) : null}
    </div>
  );
}
