import { useTranslation } from "react-i18next";
import { Info, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { fmtEUR, type Snapshot } from "@/lib/salary";
import {
  computeMonthlyLiquidity,
  type LiquidityBreakdown,
} from "@/lib/hr/compensation-liquidity";
import type { BenefitExpense } from "@/lib/benefits";

type Props = {
  snapshot: Snapshot | null | undefined;
  expenses?: BenefitExpense[];
  /** Optional pre-computed breakdown (skips snapshot recompute). */
  breakdown?: LiquidityBreakdown;
};

export function MonthlyLiquidityCard({ snapshot, expenses, breakdown }: Props) {
  const { t } = useTranslation("hr");
  const b =
    breakdown ?? computeMonthlyLiquidity({ snapshot, expenses: expenses ?? [] });

  const rows: Array<{ label: string; value: number; muted?: boolean }> = [
    { label: t("compensationLiquidity.breakdown.netSalary"), value: b.netSalary },
    { label: t("compensationLiquidity.breakdown.mealAllowance"), value: b.mealAllowance },
    { label: t("compensationLiquidity.breakdown.avgBenefits"), value: b.avgBenefits, muted: true },
    { label: t("compensationLiquidity.breakdown.transitPass"), value: b.transitPass, muted: true },
    { label: t("compensationLiquidity.breakdown.perDiem"), value: b.perDiem, muted: true },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4 text-[var(--hr-accent)]" />
              {t("compensationLiquidity.title")}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="size-3.5 opacity-60 hover:opacity-100" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">
                    {t("compensationLiquidity.tooltip")}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {t("compensationLiquidity.netCompensationLabel")}{" "}
              <span className="font-medium text-foreground tabular-nums">
                {fmtEUR(b.netCompensation)}
              </span>
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold tabular-nums text-[var(--sage)]">
              {fmtEUR(b.total)}
            </div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t("compensationLiquidity.perMonth")}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="divide-y">
          {rows.map((r) => (
            <div
              key={r.label}
              className={`flex items-baseline justify-between py-1.5 text-sm ${r.muted ? "text-muted-foreground" : ""}`}
            >
              <span>{r.label}</span>
              <span className="font-mono tabular-nums">{fmtEUR(r.value)}</span>
            </div>
          ))}
          <div className="flex items-baseline justify-between py-2 text-sm font-semibold">
            <span>{t("compensationLiquidity.breakdown.total")}</span>
            <span className="font-mono tabular-nums">{fmtEUR(b.total)}</span>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {t("compensationLiquidity.windowNote")}
        </p>
      </CardContent>
    </Card>
  );
}
