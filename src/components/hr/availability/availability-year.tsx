import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { AvailabilityPerson } from "@/lib/hr/use-team-availability";
import { mix } from "./absence-visuals";

const MONTH_KEYS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
] as const;

export function AvailabilityYear({
  people,
  matrix,
  year,
}: {
  people: AvailabilityPerson[];
  matrix: Record<string, number[]>;
  year: number;
}) {
  const { t } = useTranslation("hr");
  const max = Math.max(
    1,
    ...people.flatMap((p) => matrix[p.id] ?? []).map((n) => Number(n) || 0),
  );

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 min-w-[180px] border-b bg-card px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("availability.year.title", { year })}
            </th>
            {MONTH_KEYS.map((m) => (
              <th
                key={m}
                className="border-b border-l px-2 py-2 text-center text-[11px] uppercase text-muted-foreground"
              >
                {t(`availability.month.${m}`)}
              </th>
            ))}
            <th className="border-b border-l px-2 py-2 text-center text-[11px] uppercase text-muted-foreground">
              {t("availability.year.total")}
            </th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => {
            const row = matrix[p.id] ?? Array(12).fill(0);
            const total = row.reduce((s, n) => s + n, 0);
            return (
              <tr key={p.id}>
                <th className="sticky left-0 z-10 border-b bg-card px-3 py-1.5 text-left text-[13px] font-normal">
                  {p.nome}
                </th>
                {row.map((n, i) => (
                  <td
                    key={i}
                    className="border-b border-l px-2 py-1.5 text-center text-xs tabular-nums"
                    style={{ background: n ? mix("var(--sage)", (n / max) * 70) : undefined }}
                    title={t("availability.year.cellTip", {
                      name: p.nome,
                      month: t(`availability.month.${MONTH_KEYS[i]}`),
                      days: n,
                    })}
                  >
                    {n ? n : ""}
                  </td>
                ))}
                <td className={cn("border-b border-l px-2 py-1.5 text-center text-xs font-medium tabular-nums")}>
                  {total || ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
