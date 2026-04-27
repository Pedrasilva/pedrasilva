/**
 * Construction-percentage architectural fee calculator.
 *
 * Lives in the Overview tab of a Project Proposal. Persists its inputs to
 * `fee_proposals.project_fee_calculation` (JSONB) and exposes a helper to
 * push the resulting `finalFee` into the quote's headline `valor`,
 * `construction_cost` and `fee_percentage` fields.
 *
 * Hidden for Consultancy Proposals — the parent route already gates that
 * via `quote.quote_category`.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { formatEUR } from "@/lib/crm/types";
import {
  computeFeeCalculator,
  parseFeeCalculatorPayload,
  type FeeCalculatorInputs,
  type FeeCategory,
} from "@/lib/quotes/fee-calculator";

interface Props {
  quoteId: string;
  initialPayload: unknown;
  /** Callback fired after the user clicks "Apply to fee" so the parent
   *  form can refresh the headline `valor` / `construction_cost` /
   *  `fee_percentage` inputs without a full page reload. */
  onApplied?: (finalFee: number, constructionValue: number, feePercentage: number) => void;
}

function pctInput(value: number): string {
  // 0.10 → "10"
  return value === 0 ? "" : String(Math.round(value * 10000) / 100);
}

function parsePct(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n) / 100;
}

function numInput(value: number | null): string {
  return value == null ? "" : String(value);
}

export function QuoteFeeCalculatorCard({ quoteId, initialPayload, onApplied }: Props) {
  const { t } = useTranslation("crm");
  const qc = useQueryClient();

  const [inputs, setInputs] = useState<FeeCalculatorInputs>(() =>
    parseFeeCalculatorPayload(initialPayload),
  );

  // Re-hydrate when a different quote loads (route navigation between quotes).
  useEffect(() => {
    setInputs(parseFeeCalculatorPayload(initialPayload));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId]);

  const result = useMemo(() => computeFeeCalculator(inputs), [inputs]);

  const stageTotal = useMemo(
    () => inputs.stages.reduce((sum, s) => sum + (Number(s.percentage) || 0), 0),
    [inputs.stages],
  );

  const save = useMutation({
    mutationFn: async (apply: boolean) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: any = { project_fee_calculation: inputs };
      if (apply) {
        updates.valor = result.finalFee;
        updates.construction_cost = result.constructionValue || null;
        updates.fee_percentage = Number(result.feePercentage.toFixed(4)) || null;
      }
      const { error } = await supabase
        .from("fee_proposals")
        .update(updates)
        .eq("id", quoteId);
      if (error) throw error;
      return apply;
    },
    onSuccess: (applied) => {
      toast.success(
        applied ? t("feeCalculator.appliedToast") : t("feeCalculator.savedToast"),
      );
      qc.invalidateQueries({ queryKey: ["fee_proposal", quoteId] });
      if (applied) {
        onApplied?.(result.finalFee, result.constructionValue, result.feePercentage);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStageName = (idx: number, name: string) =>
    setInputs((p) => ({
      ...p,
      stages: p.stages.map((s, i) => (i === idx ? { ...s, name } : s)),
    }));

  const setStagePct = (idx: number, raw: string) =>
    setInputs((p) => ({
      ...p,
      stages: p.stages.map((s, i) =>
        i === idx ? { ...s, percentage: parsePct(raw) } : s,
      ),
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("feeCalculator.title")}</CardTitle>
        <p className="text-xs text-muted-foreground">{t("feeCalculator.subtitle")}</p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* INPUTS */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>{t("feeCalculator.constructionValue")}</Label>
            <Input
              type="number" step="0.01" min={0}
              value={numInput(inputs.constructionValue)}
              onChange={(e) =>
                setInputs((p) => ({
                  ...p,
                  constructionValue: e.target.value === "" ? null : Number(e.target.value),
                }))
              }
              placeholder={t("feeCalculator.constructionValuePh")}
            />
          </div>
          <div>
            <Label>{t("feeCalculator.costPerSqm")}</Label>
            <Input
              type="number" step="0.01" min={0}
              value={numInput(inputs.costPerSqm)}
              onChange={(e) =>
                setInputs((p) => ({
                  ...p,
                  costPerSqm: e.target.value === "" ? null : Number(e.target.value),
                }))
              }
            />
          </div>
          <div>
            <Label>{t("feeCalculator.area")}</Label>
            <Input
              type="number" step="0.01" min={0}
              value={numInput(inputs.area)}
              onChange={(e) =>
                setInputs((p) => ({
                  ...p,
                  area: e.target.value === "" ? null : Number(e.target.value),
                }))
              }
            />
          </div>
          <div>
            <Label>{t("feeCalculator.category")}</Label>
            <Select
              value={String(inputs.category)}
              onValueChange={(v) =>
                setInputs((p) => ({ ...p, category: (Number(v) as FeeCategory) }))
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="2">{t("feeCalculator.category2")}</SelectItem>
                <SelectItem value="3">{t("feeCalculator.category3")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("feeCalculator.discount")}</Label>
            <Input
              type="number" step="0.01" min={0} max={100}
              value={pctInput(inputs.discount)}
              onChange={(e) => setInputs((p) => ({ ...p, discount: parsePct(e.target.value) }))}
            />
          </div>
          <div>
            <Label>{t("feeCalculator.heritageUplift")}</Label>
            <Input
              type="number" step="0.01" min={0} max={100}
              value={pctInput(inputs.heritageUplift)}
              onChange={(e) =>
                setInputs((p) => ({ ...p, heritageUplift: parsePct(e.target.value) }))
              }
              placeholder="30"
            />
          </div>
          <div>
            <Label>{t("feeCalculator.extensionUplift")}</Label>
            <Input
              type="number" step="0.01" min={0} max={100}
              value={pctInput(inputs.extensionUplift)}
              onChange={(e) =>
                setInputs((p) => ({ ...p, extensionUplift: parsePct(e.target.value) }))
              }
              placeholder="20"
            />
          </div>
        </div>

        <Separator />

        {/* SUMMARY (read-only) */}
        <div className="rounded-md border bg-muted/30 p-4 text-sm space-y-1.5">
          <SummaryRow label={t("feeCalculator.summary.constructionValue")} value={formatEUR(result.constructionValue)} />
          <SummaryRow label={t("feeCalculator.summary.foundationDeduction")} value={`− ${formatEUR(result.foundationDeduction)}`} />
          {result.heritageUpliftValue > 0 && (
            <SummaryRow label={t("feeCalculator.summary.heritageUplift")} value={`+ ${formatEUR(result.heritageUpliftValue)}`} />
          )}
          {result.extensionUpliftValue > 0 && (
            <SummaryRow label={t("feeCalculator.summary.extensionUplift")} value={`+ ${formatEUR(result.extensionUpliftValue)}`} />
          )}
          <SummaryRow label={t("feeCalculator.summary.adjustedValue")} value={formatEUR(result.adjustedConstructionValue)} bold />
          <SummaryRow
            label={t("feeCalculator.summary.feePct")}
            value={`${result.feePercentage.toFixed(2)} %`}
          />
          <SummaryRow label={t("feeCalculator.summary.baseFee")} value={formatEUR(result.baseFee)} />
          <Separator className="my-2" />
          <SummaryRow
            label={t("feeCalculator.summary.finalFee")}
            value={formatEUR(result.finalFee)}
            bold
            highlight
          />
        </div>

        {/* STAGE BREAKDOWN */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("feeCalculator.stageBreakdown")}
            </Label>
            <span
              className={
                "text-xs " +
                (Math.abs(stageTotal - 1) < 0.001
                  ? "text-muted-foreground"
                  : "text-amber-600 dark:text-amber-400")
              }
            >
              {t("feeCalculator.stageTotal", { pct: (stageTotal * 100).toFixed(1) })}
            </span>
          </div>
          <div className="rounded-md border divide-y">
            {inputs.stages.map((s, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center p-2 text-sm">
                <div className="col-span-1 text-xs text-muted-foreground">
                  {idx + 1}
                </div>
                <Input
                  className="col-span-6 h-8"
                  placeholder={t("feeCalculator.stageNamePh")}
                  value={s.name}
                  onChange={(e) => setStageName(idx, e.target.value)}
                />
                <div className="col-span-2 flex items-center gap-1">
                  <Input
                    className="h-8"
                    type="number" step="0.01" min={0} max={100}
                    value={pctInput(s.percentage)}
                    onChange={(e) => setStagePct(idx, e.target.value)}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
                <div className="col-span-3 text-right tabular-nums">
                  {formatEUR(result.stageBreakdown[idx]?.amount ?? 0)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline" size="sm"
            disabled={save.isPending}
            onClick={() => save.mutate(false)}
          >
            {t("feeCalculator.saveDraft")}
          </Button>
          <Button
            size="sm"
            disabled={save.isPending || result.finalFee <= 0}
            onClick={() => save.mutate(true)}
          >
            {t("feeCalculator.applyToFee")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryRow({
  label, value, bold, highlight,
}: { label: string; value: string; bold?: boolean; highlight?: boolean }) {
  return (
    <div className={"flex items-center justify-between " + (highlight ? "text-base" : "")}>
      <span className={"text-muted-foreground " + (highlight ? "text-foreground" : "")}>{label}</span>
      <span className={"tabular-nums " + (bold ? "font-semibold" : "")}>{value}</span>
    </div>
  );
}
