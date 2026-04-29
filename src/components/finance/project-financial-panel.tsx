/**
 * Simple project financial panel.
 *
 * Displays per-project rollups from `useProjectFinancialSummary`:
 * cost, billed, received, margin, cash position, and reimbursable
 * tracking (cost / billed / received / unbilled / unpaid).
 *
 * This is the data-layer surface for Project ↔ Finance integration.
 * No editing, no automation, no bank-transaction reads.
 */

import { useTranslation } from "react-i18next";
import { useProjectFinancialSummary } from "@/lib/finance/use-project-financials";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChevronDown, Info } from "lucide-react";

const fmtEUR = (v: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v || 0);

export function ProjectFinancialPanel() {
  const { t } = useTranslation("finance");
  const { data, isLoading } = useProjectFinancialSummary();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("projectFinancials.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("projectFinancials.subtitle")}
        </p>
        <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          {t("projectFinancials.reimbEstimateNote")}
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">…</p>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("projectFinancials.empty")}
          </p>
        ) : (
        <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          {t("projectFinancials.reimbEstimateNote")}
        </p>
        <Collapsible className="mt-3">
          <CollapsibleTrigger className="group flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
            <Info className="h-3.5 w-3.5" />
            {t("projectFinancials.howCalculated.title")}
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-1.5 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <p>{t("projectFinancials.howCalculated.cost")}</p>
            <p>{t("projectFinancials.howCalculated.billed")}</p>
            <p>{t("projectFinancials.howCalculated.received")}</p>
            <p>{t("projectFinancials.howCalculated.paid")}</p>
            <p>{t("projectFinancials.howCalculated.margin")}</p>
            <p>{t("projectFinancials.howCalculated.cash")}</p>
            <p>{t("projectFinancials.howCalculated.reimbReceived")}</p>
            <p>{t("projectFinancials.howCalculated.attribution")}</p>
          </CollapsibleContent>
        </Collapsible>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">…</p>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("projectFinancials.empty")}
          </p>
        ) : (
          <TooltipProvider delayDuration={200}>
          <div className="overflow-x-auto">
                <TableRow>
                  <TableHead>{t("projectFinancials.project")}</TableHead>
                  <TableHead className="text-right">
                    {t("projectFinancials.cost")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("projectFinancials.billed")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("projectFinancials.received")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("projectFinancials.paid")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("projectFinancials.margin")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("projectFinancials.cash")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("projectFinancials.reimbCost")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("projectFinancials.reimbBilled")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("projectFinancials.reimbReceived")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("projectFinancials.reimbUnbilled")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("projectFinancials.reimbUnpaid")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((r) => (
                  <TableRow key={r.project_id}>
                    <TableCell className="font-medium">
                      {r.project_name ?? t("projectFinancials.noProject")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtEUR(r.total_cost)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtEUR(r.total_billed)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtEUR(r.total_received)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtEUR(r.total_paid)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${
                        r.margin < 0 ? "text-destructive" : ""
                      }`}
                    >
                      {fmtEUR(r.margin)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${
                        r.cash_position < 0 ? "text-destructive" : ""
                      }`}
                    >
                      {fmtEUR(r.cash_position)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtEUR(r.reimbursable_cost)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtEUR(r.reimbursable_billed)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtEUR(r.reimbursable_received)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${
                        r.reimbursable_unbilled > 0 ? "text-amber-600" : ""
                      }`}
                    >
                      {fmtEUR(r.reimbursable_unbilled)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${
                        r.reimbursable_unpaid > 0 ? "text-amber-600" : ""
                      }`}
                    >
                      {fmtEUR(r.reimbursable_unpaid)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
