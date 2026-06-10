/**
 * Monthly readings for a fee-only retainer stage (read-only).
 *
 * Shows one row per retainer month with: fee billed, hours logged, cost
 * consumed, value delivered, and two over/under indicators:
 *   • Margin   = fee − cost  (green when ≥ 0)
 *   • Delivery = value − fee (green when ≥ 0; under-delivery flagged)
 *
 * Hour logging happens in the Projects → Timesheet module, not here.
 */
import { useTranslation } from "react-i18next";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { formatEUR } from "@/lib/crm/types";
import { useRetainerMonthlyActuals } from "@/lib/quotes/use-retainer-monthly-actuals";

interface Props {
  quoteId: string;
  stageId: string;
  anchorMonth: string;
  months: number;
  monthlyFee: number;
}

function formatMonth(ym: string, locale: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString(locale, { month: "short", year: "numeric" });
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function RetainerMonthlyReadings({
  quoteId: _quoteId,
  stageId,
  anchorMonth,
  months,
  monthlyFee,
}: Props) {
  const { t, i18n } = useTranslation("crm");
  const locale = (i18n.language ?? "").startsWith("pt") ? "pt-PT" : "en";

  const { data, isLoading } = useRetainerMonthlyActuals({
    stageId,
    anchorMonth,
    months,
    monthlyFee,
  });

  const thisMonth = currentMonth();

  return (
    <div className="space-y-4 rounded-md border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold">
            {t("workspace.planning.retainerMonthly.readings.title", {
              defaultValue: "Monthly readings",
            })}
          </h4>
          <p className="text-[11px] text-muted-foreground">
            {t("workspace.planning.retainerMonthly.readings.sub", {
              defaultValue:
                "Margin compares cost vs fee. Delivery compares value generated vs fee charged.",
            })}
          </p>
        </div>
        {data && (
          <div className="text-right text-xs text-muted-foreground tabular-nums">
            {t("workspace.planning.retainerMonthly.readings.totalsLabel", {
              defaultValue: "Total",
            })}
            : <span className="font-medium text-foreground">{formatEUR(data.totals.fee)}</span>{" "}
            · {data.totals.hours.toFixed(1)} h
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                {t("workspace.planning.retainerMonthly.readings.month", {
                  defaultValue: "Month",
                })}
              </TableHead>
              <TableHead className="text-right">
                {t("workspace.planning.retainerMonthly.readings.fee", {
                  defaultValue: "Fee",
                })}
              </TableHead>
              <TableHead className="text-right">
                {t("workspace.planning.retainerMonthly.readings.hours", {
                  defaultValue: "Hours",
                })}
              </TableHead>
              <TableHead className="text-right">
                {t("workspace.planning.retainerMonthly.readings.cost", {
                  defaultValue: "Cost",
                })}
              </TableHead>
              <TableHead className="text-right">
                {t("workspace.planning.retainerMonthly.readings.value", {
                  defaultValue: "Value",
                })}
              </TableHead>
              <TableHead className="text-right">
                {t("workspace.planning.retainerMonthly.readings.margin", {
                  defaultValue: "Margin",
                })}
              </TableHead>
              <TableHead className="text-right">
                {t("workspace.planning.retainerMonthly.readings.delivery", {
                  defaultValue: "Delivery",
                })}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-xs text-muted-foreground">
                  {t("common:loading", { defaultValue: "Loading…" })}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && data?.months.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-xs text-muted-foreground">
                  {t("workspace.planning.retainerMonthly.readings.empty", {
                    defaultValue: "No months yet.",
                  })}
                </TableCell>
              </TableRow>
            )}
            {data?.months.map((b) => {
              const marginPos = b.marginDelta >= 0;
              const deliveryPos = b.deliveryDelta >= 0;
              const isThis = b.month === thisMonth;
              return (
                <TableRow
                  key={b.month}
                  className={cn(isThis && "bg-primary/5", b.isOverflow && "opacity-60")}
                >
                  <TableCell className="text-xs">
                    <span className={cn(isThis && "font-semibold")}>
                      {formatMonth(b.month, locale)}
                    </span>
                    {b.isOverflow && (
                      <span className="ml-1 text-[10px] uppercase text-muted-foreground">
                        {t("workspace.planning.retainerMonthly.readings.overflow", {
                          defaultValue: "out of span",
                        })}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {formatEUR(b.fee)}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {b.hours.toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {formatEUR(b.cost)}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {formatEUR(b.value)}
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={cn(
                        "inline-block rounded px-1.5 py-0.5 text-[11px] tabular-nums",
                        marginPos
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : "bg-red-500/15 text-red-700 dark:text-red-400",
                      )}
                    >
                      {marginPos ? "+" : ""}
                      {formatEUR(b.marginDelta)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={cn(
                        "inline-block rounded px-1.5 py-0.5 text-[11px] tabular-nums",
                        deliveryPos
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                      )}
                    >
                      {deliveryPos ? "+" : ""}
                      {formatEUR(b.deliveryDelta)}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
            {data && data.months.length > 0 && (
              <TableRow className="border-t-2 font-medium">
                <TableCell className="text-xs">
                  {t("workspace.planning.retainerMonthly.readings.totalsLabel", {
                    defaultValue: "Total",
                  })}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {formatEUR(data.totals.fee)}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {data.totals.hours.toFixed(1)}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {formatEUR(data.totals.cost)}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {formatEUR(data.totals.value)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right text-xs tabular-nums",
                    data.totals.marginDelta >= 0 ? "text-emerald-600" : "text-red-600",
                  )}
                >
                  {formatEUR(data.totals.marginDelta)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right text-xs tabular-nums",
                    data.totals.deliveryDelta >= 0 ? "text-emerald-600" : "text-amber-600",
                  )}
                >
                  {formatEUR(data.totals.deliveryDelta)}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-[11px] text-muted-foreground border-t pt-3">
        {t("workspace.planning.retainerMonthly.readings.logElsewhere", {
          defaultValue:
            "Hours are logged in Projects → Timesheet — pick this retainer as the target there.",
        })}
      </p>
    </div>
  );
}
