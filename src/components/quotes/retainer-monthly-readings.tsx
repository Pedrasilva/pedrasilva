/**
 * Monthly readings for a fee-only retainer stage.
 *
 * Shows one row per retainer month with: fee billed, hours logged, cost
 * consumed, value delivered, and two over/under indicators:
 *   • Margin   = fee − cost  (green when ≥ 0)
 *   • Delivery = value − fee (green when ≥ 0; under-delivery flagged)
 *
 * Below the table, an inline "log hours" form lets the current user punch
 * in time without leaving the quote. Each entry snapshots cost/sale rates
 * for stable historical readings.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  useLogRetainerHours,
  useDeleteRetainerEntry,
} from "@/lib/quotes/use-log-retainer-hours";
import { useProjectsAuth } from "@/lib/projects/use-auth";

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
  quoteId,
  stageId,
  anchorMonth,
  months,
  monthlyFee,
}: Props) {
  const { t, i18n } = useTranslation("crm");
  const locale = (i18n.language ?? "").startsWith("pt") ? "pt-PT" : "en";
  const { user } = useProjectsAuth();

  const { data, isLoading } = useRetainerMonthlyActuals({
    stageId,
    anchorMonth,
    months,
    monthlyFee,
  });
  const logHours = useLogRetainerHours(quoteId);
  const delEntry = useDeleteRetainerEntry(quoteId);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [form, setForm] = useState({
    entry_date: todayIso,
    hours: "1",
    billable: true,
    notes: "",
  });

  const thisMonth = currentMonth();

  const handleLog = async () => {
    if (!user?.id) {
      toast.error(
        t("workspace.planning.retainerMonthly.readings.signInError", {
          defaultValue: "Sign in to log hours.",
        }),
      );
      return;
    }
    const h = Number(form.hours);
    if (!h || h <= 0) {
      toast.error(
        t("workspace.planning.retainerMonthly.readings.hoursError", {
          defaultValue: "Enter a positive hours value.",
        }),
      );
      return;
    }
    try {
      await logHours.mutateAsync({
        stage_id: stageId,
        user_id: user.id,
        entry_date: form.entry_date,
        hours: h,
        billable: form.billable,
        notes: form.notes.trim() || null,
      });
      setForm((f) => ({ ...f, hours: "1", notes: "" }));
      toast.success(
        t("workspace.planning.retainerMonthly.readings.logged", {
          defaultValue: "Hours logged",
        }),
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

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

      {/* Inline log form */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end border-t pt-3">
        <div>
          <Label className="text-xs">
            {t("workspace.planning.retainerMonthly.readings.date", {
              defaultValue: "Date",
            })}
          </Label>
          <Input
            type="date"
            value={form.entry_date}
            onChange={(e) => setForm((f) => ({ ...f, entry_date: e.target.value }))}
            className="h-9"
          />
        </div>
        <div>
          <Label className="text-xs">
            {t("workspace.planning.retainerMonthly.readings.hours", {
              defaultValue: "Hours",
            })}
          </Label>
          <Input
            type="number"
            min={0}
            step={0.25}
            value={form.hours}
            onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
            className="h-9 text-right"
          />
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">
            {t("workspace.planning.retainerMonthly.readings.notes", {
              defaultValue: "Notes",
            })}
          </Label>
          <Input
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder={t("workspace.planning.retainerMonthly.readings.notesPh", {
              defaultValue: "What did you work on?",
            })}
            className="h-9"
          />
        </div>
        <div className="flex items-center gap-2 self-center pt-4">
          <Checkbox
            id={`bill-${stageId}`}
            checked={form.billable}
            onCheckedChange={(v) => setForm((f) => ({ ...f, billable: v === true }))}
          />
          <Label htmlFor={`bill-${stageId}`} className="text-xs">
            {t("workspace.planning.retainerMonthly.readings.billable", {
              defaultValue: "Billable",
            })}
          </Label>
        </div>
        <Button onClick={handleLog} disabled={logHours.isPending} className="h-9">
          {t("workspace.planning.retainerMonthly.readings.log", {
            defaultValue: "Log hours",
          })}
        </Button>
      </div>

      {/* Recent entries */}
      {data && data.entries.length > 0 && (
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t("workspace.planning.retainerMonthly.readings.recent", {
              defaultValue: "Recent entries",
            })}
          </div>
          <div className="max-h-48 overflow-y-auto rounded border bg-background">
            <table className="w-full text-xs">
              <tbody>
                {data.entries
                  .slice()
                  .reverse()
                  .slice(0, 20)
                  .map((e) => (
                    <tr key={e.id} className="border-b last:border-b-0">
                      <td className="px-2 py-1 tabular-nums text-muted-foreground">
                        {e.entry_date}
                      </td>
                      <td className="px-2 py-1 tabular-nums">{e.hours.toFixed(1)} h</td>
                      <td className="px-2 py-1">
                        {e.billable ? (
                          <span className="text-emerald-600">●</span>
                        ) : (
                          <span className="text-muted-foreground">○</span>
                        )}
                      </td>
                      <td className="px-2 py-1 truncate max-w-xs">{e.notes ?? ""}</td>
                      <td className="px-2 py-1 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => {
                            if (confirm(t("common:confirmDelete", { defaultValue: "Delete?" }))) {
                              delEntry.mutate(e.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
