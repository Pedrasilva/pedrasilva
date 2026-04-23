import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation, Trans } from "react-i18next";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CalendarDays, Plus, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { computeWorkdays, type Holiday } from "@/lib/workdays";
import { useDateLocale } from "@/i18n/use-date-locale";

export const Route = createFileRoute("/_app/hr/dias-uteis")({
  component: DiasUteisPage,
});

function DiasUteisPage() {
  const { t } = useTranslation(["hr", "common"]);
  const dateLocale = useDateLocale();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");

  const { data: holidays = [] } = useQuery({
    queryKey: ["holidays"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("holidays")
        .select("*")
        .order("data", { ascending: true });
      if (error) throw error;
      return data as Holiday[];
    },
  });

  const { data: bo } = useQuery({
    queryKey: ["bo-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bo_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const breakdown = useMemo(() => computeWorkdays(year, holidays), [year, holidays]);

  const yearsAvailable = useMemo(() => {
    const set = new Set<number>([currentYear, currentYear + 1, currentYear - 1]);
    holidays.forEach((h) => set.add(parseInt(h.data.slice(0, 4), 10)));
    return Array.from(set).sort((a, b) => a - b);
  }, [holidays, currentYear]);

  const addHoliday = useMutation({
    mutationFn: async () => {
      if (!newDate || !newName.trim()) throw new Error(t("hr:diasUteis.toasts.fillFields"));
      const { error } = await supabase.from("holidays").insert({
        data: newDate,
        nome: newName.trim(),
        tipo: "nacional",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("hr:diasUteis.toasts.added"));
      setNewDate("");
      setNewName("");
      qc.invalidateQueries({ queryKey: ["holidays"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteHoliday = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("holidays").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("hr:diasUteis.toasts.removed"));
      qc.invalidateQueries({ queryKey: ["holidays"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const applyToAll = useMutation({
    mutationFn: async () => {
      // Buscar todos os colaboradores e os seus dias de férias para calcular individualmente
      const { data: collabs, error: cErr } = await supabase
        .from("collaborators")
        .select("id, dias_ferias_anuais");
      if (cErr) throw cErr;
      // Para cada colaborador, atualizar TODAS as fichas do ano selecionado com dias úteis líquidos
      let updated = 0;
      for (const c of collabs ?? []) {
        const liquido = breakdown.diasUteisLiquidos(c.dias_ferias_anuais ?? 22);
        const yearStart = `${year}-01-01`;
        const yearEnd = `${year}-12-31`;
        const { error: uErr, count } = await supabase
          .from("salary_snapshots")
          .update({ dias_uteis: liquido }, { count: "exact" })
          .eq("collaborator_id", c.id)
          .gte("reference_date", yearStart)
          .lte("reference_date", yearEnd);
        if (uErr) throw uErr;
        updated += count ?? 0;
      }
      // Atualizar bo_settings (singleton) com o valor LÍQUIDO (já com 22 dias de férias descontados)
      // — usado em /resumo, /valor-bo e Pricing como denominador anual de horas produtivas.
      if (bo?.id) {
        const { error: bErr } = await supabase
          .from("bo_settings")
          .update({ dias_uteis: breakdown.diasUteisLiquidos(22) })
          .eq("id", bo.id);
        if (bErr) throw bErr;
      }
      return updated;
    },
    onSuccess: (n) => {
      toast.success(t("hr:diasUteis.toasts.appliedToSnapshots", { count: n }));
      qc.invalidateQueries({ queryKey: ["all-snapshots"] });
      qc.invalidateQueries({ queryKey: ["snapshots"] });
      qc.invalidateQueries({ queryKey: ["bo-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="inline-flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <CalendarDays className="h-5 w-5" /> {t("hr:diasUteis.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("hr:diasUteis.subtitle")}
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {t("hr:diasUteis.yearLabel")}
            </Label>
            <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v, 10))}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearsAvailable.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button>
                  <RefreshCw className="h-4 w-4" /> {t("hr:diasUteis.applyAllButton")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t("hr:diasUteis.applyDialog.title")}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    <Trans
                      i18nKey="hr:diasUteis.applyDialog.description"
                      values={{ year, days: breakdown.diasUteisLiquidos(22) }}
                      components={{ strong: <strong /> }}
                    />
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>
                    {t("hr:diasUteis.applyDialog.cancel")}
                  </AlertDialogCancel>
                  <AlertDialogAction onClick={() => applyToAll.mutate()}>
                    {t("hr:diasUteis.applyDialog.confirm")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi label={t("hr:diasUteis.kpis.daysInYear")} value={breakdown.diasAno} />
        <Kpi label={t("hr:diasUteis.kpis.weekendDays")} value={`− ${breakdown.fimDeSemana}`} />
        <Kpi
          label={t("hr:diasUteis.kpis.holidaysOnWorkingDays")}
          value={`− ${breakdown.feriadosUteis}`}
        />
        <Kpi label={t("hr:diasUteis.kpis.workingDaysBase")} value={breakdown.diasUteisBase} />
        <Kpi
          label={t("hr:diasUteis.kpis.afterVacation")}
          value={breakdown.diasUteisLiquidos(22)}
          highlight
        />
      </div>

      {/* Feriados */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("hr:diasUteis.holidays.title", { year })}
          </CardTitle>
          <CardDescription>
            {t("hr:diasUteis.holidays.description", {
              count: breakdown.feriadosTotais,
              workingClause: t("hr:diasUteis.holidays.workingClause", {
                count: breakdown.feriadosUteis,
              }),
              weekendClause: t("hr:diasUteis.holidays.weekendClause", {
                count: breakdown.feriadosFimDeSemana,
              }),
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("hr:diasUteis.holidays.headers.date")}</TableHead>
                <TableHead>{t("hr:diasUteis.holidays.headers.weekday")}</TableHead>
                <TableHead>{t("hr:diasUteis.holidays.headers.name")}</TableHead>
                <TableHead className="text-right">
                  {t("hr:diasUteis.holidays.headers.countsAsWorkingDay")}
                </TableHead>
                {isAdmin && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {breakdown.feriadosDetalhe.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={isAdmin ? 5 : 4}
                    className="text-center text-muted-foreground"
                  >
                    {t("hr:diasUteis.holidays.empty", { year })}
                  </TableCell>
                </TableRow>
              )}
              {breakdown.feriadosDetalhe.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="tabular-nums">
                    {format(parseISO(h.data), "dd MMM yyyy", { locale: dateLocale })}
                  </TableCell>
                  <TableCell>{t(`common:weekdays.short.${h.weekday}`)}</TableCell>
                  <TableCell className="font-medium">{h.nome}</TableCell>
                  <TableCell className="text-right">
                    {h.emDiaUtil ? (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                        {t("hr:diasUteis.holidays.yes")}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {t("hr:diasUteis.holidays.weekend")}
                      </span>
                    )}
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteHoliday.mutate(h.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {isAdmin && (
            <div className="mt-4 grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-[180px_1fr_auto]">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t("hr:diasUteis.holidays.newHoliday.dateLabel")}
                </Label>
                <Input
                  type="date"
                  className="input-yellow"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t("hr:diasUteis.holidays.newHoliday.nameLabel")}
                </Label>
                <Input
                  className="input-yellow"
                  placeholder={t("hr:diasUteis.holidays.newHoliday.namePlaceholder")}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button onClick={() => addHoliday.mutate()} disabled={addHoliday.isPending}>
                  <Plus className="h-4 w-4" />{" "}
                  {t("hr:diasUteis.holidays.newHoliday.addButton")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fórmula */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("hr:diasUteis.formula.title")}</CardTitle>
          <CardDescription>
            <Trans
              i18nKey="hr:diasUteis.formula.description"
              components={{
                link: (
                  // eslint-disable-next-line jsx-a11y/anchor-has-content
                  <a
                    href="https://www.dias-uteis.pt"
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  />
                ),
              }}
            />
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Formula label={t("hr:diasUteis.formula.daysInYear")} value={breakdown.diasAno} />
          <Formula
            label={t("hr:diasUteis.formula.minusWeekend")}
            value={`−${breakdown.fimDeSemana}`}
          />
          <Formula
            label={t("hr:diasUteis.formula.minusHolidaysWorkingDays")}
            value={`−${breakdown.feriadosUteis}`}
          />
          <Formula
            label={t("hr:diasUteis.formula.workingDaysBase")}
            value={breakdown.diasUteisBase}
            highlight
          />
          <Formula label={t("hr:diasUteis.formula.minusVacation")} value={`−22`} />
          <Formula
            label={t("hr:diasUteis.formula.effectiveWorkingDays")}
            value={breakdown.diasUteisLiquidos(22)}
            highlight
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        "rounded-md border p-3 " + (highlight ? "border-primary/40 bg-primary/5" : "")
      }
    >
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Formula({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        "flex items-center justify-between border-b pb-1.5 " +
        (highlight ? "font-semibold text-primary" : "text-muted-foreground")
      }
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
