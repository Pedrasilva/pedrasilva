import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { computeSnapshot, fmtDate, fmtEUR, type Snapshot } from "@/lib/salary";
import { computeAverageBenefits } from "@/lib/hr/compensation-liquidity";
import type { BenefitExpense } from "@/lib/benefits";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function ResumoCompare({
  snapshots,
  expenses = [],
}: {
  snapshots: Snapshot[];
  expenses?: BenefitExpense[];
}) {
  const { t, i18n } = useTranslation("hr");
  const effectives = snapshots.filter((s) => s.is_effective);
  const proposals = snapshots.filter((s) => !s.is_effective);

  const lastEffective = useMemo(
    () => [...effectives].sort((a, b) => b.reference_date.localeCompare(a.reference_date))[0],
    [effectives],
  );
  const lastProposed = useMemo(
    () => [...proposals].sort((a, b) => b.reference_date.localeCompare(a.reference_date))[0],
    [proposals],
  );

  const [leftId, setLeftId] = useState<string>(lastEffective?.id ?? "");
  const [rightId, setRightId] = useState<string>(lastProposed?.id ?? "");

  const left = snapshots.find((s) => s.id === leftId) ?? lastEffective;
  const right = snapshots.find((s) => s.id === rightId) ?? lastProposed;

  // Tabela centralizada de subsídio de alimentação — aplicada em runtime
  // (mesmo padrão que SnapshotForm) para que o resumo reflicta sempre a tabela
  // configurada nas Definições, baseado no ano da reference_date de cada ficha.
  const { data: mealRates = [] } = useQuery({
    queryKey: ["meal-allowance-rates-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meal_allowance_rates")
        .select("ano, valor_cartao")
        .order("ano", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { ano: number; valor_cartao: number }[];
    },
  });

  const mealDailyFor = (s: Snapshot | undefined): number => {
    if (!s) return 0;
    // Override manual tem prioridade sobre a tabela anual
    if (s.subsidio_alimentacao_manual) return s.subsidio_alimentacao_diario_manual ?? 0;
    if (mealRates.length === 0) return s.subsidio_alimentacao_diario ?? 0;
    const y = Number((s.reference_date ?? "").slice(0, 4));
    const refYear = Number.isFinite(y) && y > 1900 ? y : new Date().getFullYear();
    const exact = mealRates.find((r) => r.ano === refYear);
    if (exact) return Number(exact.valor_cartao);
    const earlier = mealRates.filter((r) => r.ano <= refYear).sort((a, b) => b.ano - a.ano)[0];
    if (earlier) return Number(earlier.valor_cartao);
    return Number(mealRates[0].valor_cartao);
  };

  if (!left && !right) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          {t("hr:resumoCompare.emptyState")}
        </CardContent>
      </Card>
    );
  }

  const leftEffective = left ? { ...left, subsidio_alimentacao_diario: mealDailyFor(left) } : null;
  const rightEffective = right ? { ...right, subsidio_alimentacao_diario: mealDailyFor(right) } : null;

  const cl = leftEffective ? computeSnapshot(leftEffective) : null;
  const cr = rightEffective ? computeSnapshot(rightEffective) : null;

  const rows: Array<{ label: string; l: number | null; r: number | null; pct?: boolean }> = [
    { label: t("hr:resumoCompare.metrics.baseMonthly"), l: left?.valor_base ?? null, r: right?.valor_base ?? null },
    { label: t("hr:resumoCompare.metrics.baseAnnualX14"), l: cl?.baseAnual ?? null, r: cr?.baseAnual ?? null },
    { label: t("hr:resumoCompare.metrics.grossMonthly"), l: cl?.brutoMensal ?? null, r: cr?.brutoMensal ?? null },
    { label: t("hr:resumoCompare.metrics.grossAnnual"), l: cl?.brutoAnual ?? null, r: cr?.brutoAnual ?? null },
    { label: t("hr:resumoCompare.metrics.netMonthly12"), l: cl?.liquido12m ?? null, r: cr?.liquido12m ?? null },
    { label: t("hr:resumoCompare.metrics.mealAllowanceDaily"), l: leftEffective?.subsidio_alimentacao_diario ?? null, r: rightEffective?.subsidio_alimentacao_diario ?? null },
    { label: t("hr:resumoCompare.metrics.mealAllowanceMonthly"), l: cl?.alimentacaoMensal ?? null, r: cr?.alimentacaoMensal ?? null },
    { label: t("hr:resumoCompare.metrics.perDiemAnnual"), l: left?.ajudas_custo_anual ?? null, r: right?.ajudas_custo_anual ?? null },
    { label: t("hr:resumoCompare.metrics.perDiemMonthly"), l: cl?.ajudasMensal ?? null, r: cr?.ajudasMensal ?? null },
    { label: t("hr:resumoCompare.metrics.transitPassAnnual"), l: left?.passe_anual ?? null, r: right?.passe_anual ?? null },
    { label: t("hr:resumoCompare.metrics.transitPassMonthly"), l: cl?.passeMensal ?? null, r: cr?.passeMensal ?? null },
    { label: t("hr:resumoCompare.metrics.totalNetMonthly"), l: cl?.liquidoTotalMensal ?? null, r: cr?.liquidoTotalMensal ?? null },
    { label: t("hr:resumoCompare.metrics.benefitsAnnual"), l: cl?.beneficiosAnual ?? null, r: cr?.beneficiosAnual ?? null },
    { label: t("hr:resumoCompare.metrics.tgvAnnual"), l: cl?.custoVBG ?? null, r: cr?.custoVBG ?? null },
  ];

  const pctFormatter = new Intl.NumberFormat(i18n.language, {
    style: "percent",
    maximumFractionDigits: 2,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("hr:resumoCompare.title")}</CardTitle>
          <CardDescription>{t("hr:resumoCompare.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Picker
              label={t("hr:resumoCompare.columnA")}
              value={leftId || left?.id || ""}
              onChange={setLeftId}
              snapshots={snapshots}
            />
            <Picker
              label={t("hr:resumoCompare.columnB")}
              value={rightId || right?.id || ""}
              onChange={setRightId}
              snapshots={snapshots}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("hr:resumoCompare.headers.metric")}</TableHead>
                <TableHead className="text-right">
                  {left ? `${left.label} · ${fmtDate(left.reference_date)}` : t("hr:collaborator.subline.empty")}
                </TableHead>
                <TableHead className="text-right">
                  {right ? `${right.label} · ${fmtDate(right.reference_date)}` : t("hr:collaborator.subline.empty")}
                </TableHead>
                <TableHead className="text-right">{t("hr:resumoCompare.headers.delta")}</TableHead>
                <TableHead className="text-right">{t("hr:resumoCompare.headers.deltaPct")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const delta = r.l != null && r.r != null ? r.r - r.l : null;
                const pct = r.l && r.r != null ? (r.r - r.l) / r.l : null;
                const cls =
                  delta == null
                    ? "text-muted-foreground"
                    : delta > 0
                      ? "text-positive"
                      : delta < 0
                        ? "text-negative"
                        : "";
                return (
                  <TableRow key={r.label}>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.l == null ? t("hr:collaborator.subline.empty") : fmtEUR(r.l)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.r == null ? t("hr:collaborator.subline.empty") : fmtEUR(r.r)}
                    </TableCell>
                    <TableCell className={"text-right tabular-nums " + cls}>
                      {delta == null ? t("hr:collaborator.subline.empty") : (delta > 0 ? "+" : "") + fmtEUR(delta)}
                    </TableCell>
                    <TableCell className={"text-right tabular-nums " + cls}>
                      {pct == null ? t("hr:collaborator.subline.empty") : pctFormatter.format(pct)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Picker({
  label,
  value,
  onChange,
  snapshots,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  snapshots: Snapshot[];
}) {
  const { t } = useTranslation("hr");
  return (
    <div className="space-y-1.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={t("hr:resumoCompare.pickerPlaceholder")} />
        </SelectTrigger>
        <SelectContent>
          {snapshots.map((s) => {
            // Highlight rows whose effective_from is within ±30 days of today.
            const effFrom = s.effective_from ?? s.reference_date;
            const days = effFrom
              ? Math.round((new Date(effFrom).getTime() - Date.now()) / 86400000)
              : null;
            const recent = days != null && days <= 0 && days >= -30;
            const upcoming = days != null && days > 0 && days <= 30;
            const sourceLabel = s.source && s.source !== "manual"
              ? ` · ${t(`hr:resumoCompare.source.${s.source}`)}`
              : "";
            const stateBadge = recent
              ? ` · ${t("hr:resumoCompare.recentlyChanged")}`
              : upcoming
                ? ` · ${t("hr:resumoCompare.upcoming")}`
                : "";
            return (
              <SelectItem key={s.id} value={s.id}>
                {s.label} · {fmtDate(effFrom)} {s.is_effective ? `· ${t("hr:resumoCompare.inForceShort")}` : ""}{sourceLabel}{stateBadge}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
