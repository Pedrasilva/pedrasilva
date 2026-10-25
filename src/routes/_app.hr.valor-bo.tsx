import { useTranslation } from "react-i18next";
import uiI18n from "@/i18n/index";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  type Collaborator,
  type Snapshot,
  computeSnapshot,
  fmtEUR,
} from "@/lib/salary";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PermissionGate } from "@/components/PermissionGate";

export const Route = createFileRoute("/_app/hr/valor-bo")({
  component: () => (
    <PermissionGate permission="hr.valor-bo">
      <ValorBOPage />
    </PermissionGate>
  ),
});

type BoSettings = {
  id: string;
  custos_operacionais_anual: number;
  dias_uteis: number;
  horas_dia: number;
  margem_lucro_pct: number;
  notas: string | null;
};

export function computeValorBO(args: {
  custosOperacionais: number; // D3
  custoBackoffice: number; // D4 (soma VBG BO)
  custoProjecto: number; // D5 (soma VBG Projecto)
  numColaboradoresProjecto: number; // D11
  diasUteis: number; // D13
  horasDia: number;
}) {
  const totalAnual = args.custosOperacionais + args.custoBackoffice; // D14 = D3+D4
  const porColabAno =
    args.numColaboradoresProjecto > 0 ? totalAnual / args.numColaboradoresProjecto : 0;
  const porColabDia = args.diasUteis > 0 ? porColabAno / args.diasUteis : 0;
  const valorHora = args.horasDia > 0 ? Math.ceil(porColabDia) / args.horasDia : 0;
  return { totalAnual, porColabAno, porColabDia, valorHora };
}

function ValorBOPage() {
  useTranslation();
  const qc = useQueryClient();

  const { data: collaborators = [] } = useQuery({
    queryKey: ["collaborators", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collaborators")
        .select("*")
        .is("archived_at", null)
        .order("nome");
      if (error) throw error;
      return data as Collaborator[];
    },
  });

  const { data: snapshots = [] } = useQuery({
    queryKey: ["all-snapshots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salary_snapshots")
        .select("*")
        .order("reference_date", { ascending: false });
      if (error) throw error;
      return data as Snapshot[];
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["bo-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bo_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as BoSettings | null;
    },
  });

  const [draft, setDraft] = useState<BoSettings | null>(null);
  useEffect(() => {
    if (settings) setDraft(settings);
  }, [settings]);

  const save = useMutation({
    mutationFn: async (s: BoSettings) => {
      const { error } = await supabase
        .from("bo_settings")
        .update({
          custos_operacionais_anual: Number(s.custos_operacionais_anual),
          dias_uteis: Number(s.dias_uteis),
          horas_dia: Number(s.horas_dia),
          margem_lucro_pct: Number(s.margem_lucro_pct),
          notas: s.notas,
        })
        .eq("id", s.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(uiI18n.t("hr:batchFive.labels.parametersSaved"));
      qc.invalidateQueries({ queryKey: ["bo-settings"] });
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  // Pega na ficha de referência (efectiva ou, se não houver, proposta) por colaborador
  const refByCollab = useMemo(() => {
    const map = new Map<string, Snapshot>();
    for (const c of collaborators) {
      const sns = snapshots.filter((s) => s.collaborator_id === c.id);
      const ref = sns.find((s) => s.is_effective) ?? sns[0];
      if (ref) map.set(c.id, ref);
    }
    return map;
  }, [collaborators, snapshots]);

  const backoffice = collaborators.filter((c) => c.departamento === "Backoffice");
  const projecto = collaborators.filter((c) => c.departamento === "Projecto");

  const custoBackoffice = backoffice.reduce((acc, c) => {
    const s = refByCollab.get(c.id);
    return acc + (s ? computeSnapshot(s).custoVBG : 0);
  }, 0);

  const custoProjecto = projecto.reduce((acc, c) => {
    const s = refByCollab.get(c.id);
    return acc + (s ? computeSnapshot(s).custoVBG : 0);
  }, 0);

  const result = computeValorBO({
    custosOperacionais: Number(draft?.custos_operacionais_anual ?? 0),
    custoBackoffice,
    custoProjecto,
    numColaboradoresProjecto: projecto.length,
    diasUteis: Number(draft?.dias_uteis ?? 220),
    horasDia: Number(draft?.horas_dia ?? 8),
  });

  if (!draft) {
    return <div className="text-muted-foreground"> {uiI18n.t("hr:batchFive.labels.loadingParameters")} </div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight"> {uiI18n.t("hr:batchFive.labels.backofficeValueHour")} </h1>
        <p className="text-sm text-muted-foreground">
           {uiI18n.t("hr:batchFive.labels.calculationOfTheReferenceHourlySaleValue")} </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base"> {uiI18n.t("common:parameters")} </CardTitle>
          <CardDescription> {uiI18n.t("hr:batchFive.labels.yellowFieldsManualInput")} </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label> {uiI18n.t("hr:batchFive.labels.annualOperatingCostsD")} </Label>
            <Input
              type="number"
              step="0.01"
              className="input-yellow tabular-nums"
              value={draft.custos_operacionais_anual}
              onChange={(e) =>
                setDraft({ ...draft, custos_operacionais_anual: Number(e.target.value) })
              }
            />
          </div>
          <div className="space-y-1">
            <Label> {uiI18n.t("hr:batchFive.labels.workingDaysD")} </Label>
            <div className="flex h-9 items-center justify-end rounded-md border bg-muted px-3 text-right text-sm tabular-nums text-muted-foreground">
              {draft.dias_uteis}
            </div>
            <p className="text-[11px] text-muted-foreground">
               {uiI18n.t("hr:batchFive.labels.definedIn")} <strong> {uiI18n.t("hr:batchFive.labels.settingsWorkingDays")} </strong>.
            </p>
          </div>
          <div className="space-y-1">
            <Label> {uiI18n.t("hr:collaborator.capacityRecovery.dailyHours")} </Label>
            <Input
              type="number"
              step="0.5"
              className="input-yellow tabular-nums"
              value={draft.horas_dia}
              onChange={(e) => setDraft({ ...draft, horas_dia: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label> {uiI18n.t("hr:batchFive.labels.globalProfitMargin")} </Label>
            <Input
              type="number"
              step="0.5"
              className="input-yellow tabular-nums"
              value={(Number(draft.margem_lucro_pct) * 100).toFixed(2)}
              onChange={(e) =>
                setDraft({ ...draft, margem_lucro_pct: Number(e.target.value) / 100 })
              }
            />
            <p className="text-xs text-muted-foreground">
               {uiI18n.t("hr:batchFive.labels.appliesByDefaultToAllProjectTeam")} </p>
          </div>
          <div className="sm:col-span-3">
            <Button onClick={() => save.mutate(draft)} disabled={save.isPending}>
              {save.isPending ? uiI18n.t("common:saving") : uiI18n.t("hr:batchFive.labels.saveParameters")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base"> {uiI18n.t("hr:batchFive.labels.calculation")} </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"> {uiI18n.t("hr:batchFive.labels.cell")} </TableHead>
                <TableHead> {uiI18n.t("common:description")} </TableHead>
                <TableHead className="text-right"> {uiI18n.t("glossary:financial.value")} </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <Row code="D3" label={uiI18n.t("hr:batchFive.labels.annualOperatingCostsManual")} value={fmtEUR(Number(draft.custos_operacionais_anual))} />
              <Row code="D4" label={uiI18n.t("hr:batchFive.labels.backofficeTeamTotalCostTotalGrossValueWithValuesCollaborators", { value1: backoffice.length })} value={fmtEUR(custoBackoffice)} />
              <Row code="D5" label={uiI18n.t("hr:batchFive.labels.projectTeamTotalCostTotalGrossValueWithValuesCollaborators", { value1: projecto.length })} value={fmtEUR(custoProjecto)} />
              <Row code="D11" label={uiI18n.t("hr:batchFive.labels.projectTeamCollaboratorCount")} value={String(projecto.length)} />
              <Row code="D13" label={uiI18n.t("common:shell.link.settings.workingDays")} value={String(draft.dias_uteis)} />
              <Row code="D14" label={uiI18n.t("hr:batchFive.labels.totalToDistributeDD")} value={fmtEUR(result.totalAnual)} bold />
              <Row code="D15" label={uiI18n.t("hr:batchFive.labels.perCollaboratorYear")} value={fmtEUR(result.porColabAno)} />
              <Row code="D16" label={uiI18n.t("hr:batchFive.labels.perCollaboratorDay")} value={fmtEUR(result.porColabDia)} />
              <Row
                code="D18"
                label={uiI18n.t("hr:batchFive.labels.backofficeValueHourReferenceSaleValue")}
                value={fmtEUR(result.valorHora)}
                highlight
              />
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  code,
  label,
  value,
  bold,
  highlight,
}: {
  code: string;
  label: string;
  value: string;
  bold?: boolean;
  highlight?: boolean;
}) {
  useTranslation();
  return (
    <TableRow className={highlight ? "bg-primary/5" : ""}>
      <TableCell className="font-mono text-xs text-muted-foreground">{code}</TableCell>
      <TableCell className={bold || highlight ? "font-medium" : ""}>{label}</TableCell>
      <TableCell
        className={
          "text-right tabular-nums " +
          (highlight ? "text-lg font-semibold text-primary" : bold ? "font-semibold" : "")
        }
      >
        {value}
      </TableCell>
    </TableRow>
  );
}
