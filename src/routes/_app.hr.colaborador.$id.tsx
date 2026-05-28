import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format, parseISO } from "date-fns";
import { useDateLocale } from "@/i18n/use-date-locale";
import { supabase } from "@/integrations/supabase/client";
import { useRecordRecentlyViewed } from "@/hooks/use-recently-viewed";
import {
  type Collaborator,
  type Snapshot,
  defaultSnapshot,
} from "@/lib/salary";
import { ESTADOS_CIVIS, LOCALIZACOES } from "@/lib/irs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ArrowLeft, Plus, Archive, ArchiveRestore, BarChart3, Save, Printer, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { SnapshotForm } from "@/components/SnapshotForm";
import { SnapshotMirrorPanel } from "@/components/snapshot/SnapshotMirrorPanel";
import { ResumoCompare } from "@/components/ResumoCompare";
import { CollaboratorPhotoUploader } from "@/components/CollaboratorPhotoUploader";
import { CommercialRoleCard } from "@/components/hr/CommercialRoleCard";

import {
  useArchiveCollaborator,
  useRestoreCollaborator,
  useCollaboratorReferenceCounts,
} from "@/lib/hr/use-collaborators";
import { ArchiveCollaboratorDialog } from "@/components/hr/archive-collaborator-dialog";
import { RestoreCollaboratorDialog } from "@/components/hr/restore-collaborator-dialog";
import { humanizeMutationError } from "@/lib/hr/error-messages";
import { computeCollaboratorFte } from "@/lib/hr/fte";
import {
  getResourceSplit,
  splitMonthlyCompanyCostFromSnapshot,
} from "@/lib/finance/hybrid-resource-cost";
import { fmtEUR } from "@/lib/salary";
import {
  computeWeeklyCapacity,
  computeRecoverableHours,
  formatChargeabilityPct,
  formatHoursPerWeek,
} from "@/lib/hr/chargeability";
import { useAuth } from "@/hooks/use-auth";
import { MonthlyLiquidityCard } from "@/components/hr/MonthlyLiquidityCard";
import type { BenefitExpense } from "@/lib/benefits";

import { PermissionGate } from "@/components/PermissionGate";
import { useHasPermission } from "@/hooks/use-permissions";

export const Route = createFileRoute("/_app/hr/colaborador/$id")({
  component: () => (
    <PermissionGate permission="hr.colaborador.view">
      <CollaboratorPage />
    </PermissionGate>
  ),
});

function CollaboratorPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { t } = useTranslation(["hr", "common"]);
  const dateLocale = useDateLocale();
  const fmtSnapshotDate = (iso: string) =>
    format(parseISO(iso), "dd MMM yyyy", { locale: dateLocale });
  const { isAdmin } = useAuth();
  const { allowed: canViewCompensation } = useHasPermission("hr.colaborador.compensation.view");
  const [activeTab, setActiveTab] = useState<string>("");
  const [newOpen, setNewOpen] = useState(false);
  const [dadosOpen, setDadosOpen] = useState(false);
  const [agregadoOpen, setAgregadoOpen] = useState(false);
  const [newForm, setNewForm] = useState({
    label: t("hr:collaborator.defaults.proposedLabel"),
    reference_date: new Date().toISOString().slice(0, 10),
    is_effective: false,
    copyFrom: "",
  });

  const { data: collab } = useQuery({
    queryKey: ["collaborator", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collaborators")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Collaborator;
    },
  });

  useRecordRecentlyViewed({
    module: "hr",
    href: `/hr/colaborador/${id}`,
    label: collab?.nome ?? "",
  });

  const { data: snapshots = [] } = useQuery({
    queryKey: ["snapshots", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salary_snapshots")
        .select("*")
        .eq("collaborator_id", id)
        .order("reference_date", { ascending: true });
      if (error) throw error;
      return data as Snapshot[];
    },
  });

  const { data: benefitExpenses = [] } = useQuery({
    queryKey: ["collaborator-benefit-expenses-12m", id],
    queryFn: async () => {
      const from = new Date();
      from.setMonth(from.getMonth() - 12);
      const { data, error } = await supabase
        .from("benefit_expenses")
        .select("*")
        .eq("collaborator_id", id)
        .gte("data_despesa", from.toISOString().slice(0, 10));
      if (error) throw error;
      return (data ?? []) as BenefitExpense[];
    },
  });

  const effectiveSnapshot = useMemo(
    () => snapshots.find((s) => s.is_effective) ?? snapshots[0] ?? null,
    [snapshots],
  );

  const [draft, setDraft] = useState<Collaborator | null>(null);
  useEffect(() => {
    if (collab) setDraft(collab);
  }, [collab]);

  const isDirty = useMemo(() => {
    if (!collab || !draft) return false;
    return (
      draft.nome !== collab.nome ||
      (draft.numero_colaborador ?? "") !== (collab.numero_colaborador ?? "") ||
      (draft.email ?? "") !== (collab.email ?? "") ||
      draft.departamento !== collab.departamento ||
      (draft.situacao_contractual ?? "") !== (collab.situacao_contractual ?? "") ||
      (draft.data_nascimento ?? "") !== (collab.data_nascimento ?? "") ||
      (draft.inicio_carreira ?? "") !== (collab.inicio_carreira ?? "") ||
      (draft.margem_lucro_pct_override ?? null) !== (collab.margem_lucro_pct_override ?? null) ||
      draft.dias_ferias_anuais !== collab.dias_ferias_anuais ||
      draft.saldo_ferias_anterior !== collab.saldo_ferias_anterior ||
      (draft.dias_ferias_extra ?? 0) !== (collab.dias_ferias_extra ?? 0) ||
      draft.localizacao !== collab.localizacao ||
      draft.estado_civil !== collab.estado_civil ||
      draft.numero_titulares !== collab.numero_titulares ||
      draft.numero_dependentes !== collab.numero_dependentes ||
      draft.dependentes_com_deficiencia !== collab.dependentes_com_deficiencia ||
      draft.ano_fiscal !== collab.ano_fiscal ||
      Number(draft.daily_hours ?? 8) !== Number(collab.daily_hours ?? 8) ||
      Number(draft.days_per_week ?? 5) !== Number(collab.days_per_week ?? 5) ||
      (draft.target_chargeability_pct ?? null) !== (collab.target_chargeability_pct ?? null) ||
      (draft.resource_classification ?? "project") !== (collab.resource_classification ?? "project") ||
      Number(draft.backoffice_pct ?? 0) !== Number(collab.backoffice_pct ?? 0)
    );
  }, [collab, draft]);


  const updateCollab = useMutation({
    mutationFn: async (patch: Partial<Collaborator>) => {
      const { error } = await supabase.from("collaborators").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("hr:collaborator.toasts.saved"));
      qc.invalidateQueries({ queryKey: ["collaborator", id] });
      qc.invalidateQueries({ queryKey: ["collaborators"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setField = <K extends keyof Collaborator>(k: K, v: Collaborator[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  const handleSave = () => {
    if (!draft) return;
    updateCollab.mutate({
      nome: draft.nome,
      numero_colaborador: draft.numero_colaborador || null,
      email: draft.email?.trim().toLowerCase() || null,
      departamento: draft.departamento,
      situacao_contractual: draft.situacao_contractual || null,
      data_nascimento: draft.data_nascimento || null,
      inicio_carreira: draft.inicio_carreira || null,
      margem_lucro_pct_override: draft.margem_lucro_pct_override,
      dias_ferias_anuais: draft.dias_ferias_anuais,
      saldo_ferias_anterior: draft.saldo_ferias_anterior,
      dias_ferias_extra: draft.dias_ferias_extra ?? 0,
      localizacao: draft.localizacao,
      estado_civil: draft.estado_civil,
      numero_titulares: draft.numero_titulares,
      numero_dependentes: draft.numero_dependentes,
      dependentes_com_deficiencia: draft.dependentes_com_deficiencia,
      ano_fiscal: draft.ano_fiscal,
      daily_hours: Number(draft.daily_hours ?? 8),
      days_per_week: Number(draft.days_per_week ?? 5),
      target_chargeability_pct: draft.target_chargeability_pct ?? null,
      resource_classification: draft.resource_classification ?? "project",
      backoffice_pct: Number(draft.backoffice_pct ?? 0),
    });
  };


  const createSnap = useMutation({
    mutationFn: async () => {
      const base = newForm.copyFrom
        ? snapshots.find((s) => s.id === newForm.copyFrom)
        : null;
      const seed = base
        ? { ...base }
        : defaultSnapshot(id, newForm.label, newForm.is_effective);
      const payload = {
        ...seed,
        id: undefined as unknown as string,
        collaborator_id: id,
        label: newForm.label || t("hr:collaborator.defaults.snapshotFallback"),
        reference_date: newForm.reference_date,
        is_effective: newForm.is_effective,
        // New effective-dated record. Regular edits happen in-place from the
        // sheet form; this action is the explicit way to create a separate sheet.
        effective_from: newForm.reference_date,
        effective_to: null,
        source: "manual" as const,
        import_log_id: null,
      };
      delete (payload as { id?: string }).id;
      const { data, error } = await supabase
        .from("salary_snapshots")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as Snapshot;
    },
    onSuccess: (s) => {
      toast.success(t("hr:collaborator.toasts.snapshotCreated"));
      qc.invalidateQueries({ queryKey: ["snapshots", id] });
      setActiveTab(s.id);
      setNewOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archiveMut = useArchiveCollaborator();
  const restoreMut = useRestoreCollaborator();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const refCounts = useCollaboratorReferenceCounts(id, !!collab?.archived_at);

  const handleArchiveConfirm = (reason: string) => {
    archiveMut.mutate(
      { id, reason },
      {
        onSuccess: () => {
          toast.success(t("hr:collaborator.toasts.archived"));
          setArchiveOpen(false);
          navigate({ to: "/hr/colaboradores" });
        },
        onError: (e) => toast.error(humanizeMutationError(e, t)),
      },
    );
  };

  const handleRestoreConfirm = () => {
    restoreMut.mutate(id, {
      onSuccess: () => {
        toast.success(t("hr:collaborator.toasts.restored"));
        setRestoreOpen(false);
        qc.invalidateQueries({ queryKey: ["collaborator", id] });
      },
      onError: (e) => toast.error(humanizeMutationError(e, t)),
    });
  };

  if (!collab || !draft) return <div className="text-sm text-muted-foreground">{t("hr:collaborator.loading")}</div>;

  const tabValue = activeTab || (snapshots[0]?.id ?? "resumo");

  return (
    <div className="space-y-6 print-area">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-end gap-4">
          <div className="no-print">
            <CollaboratorPhotoUploader
              collaboratorId={collab.id}
              name={collab.nome}
              fotoPath={collab.foto_path}
              size={88}
            />
          </div>
          <div className="space-y-1">
            <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground no-print">
              <ArrowLeft className="h-3 w-3" /> {t("hr:collaborator.back")}
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight">{collab.nome}</h1>
            <p className="text-sm text-muted-foreground">
              {t(`hr:enums.department.${collab.departamento}`)} · {collab.numero_colaborador || t("hr:collaborator.subline.noNumber")} · {collab.situacao_contractual ? (t(`hr:collaborator.contractStatus.${contractStatusKey(collab.situacao_contractual)}`, { defaultValue: collab.situacao_contractual })) : t("hr:collaborator.subline.empty")}
              {collab.archived_at && (
                <>
                  {" · "}
                  <span className="font-medium text-foreground">
                    {t("hr:collaborator.inactiveBadge")}
                  </span>
                </>
              )}
            </p>
            {collab.archived_at && (
              <div className="mt-2 rounded-md border border-muted-foreground/20 bg-muted/40 p-2 text-xs text-muted-foreground space-y-0.5 max-w-md">
                <div>
                  {t("hr:colaboradores.archivedMeta.on", {
                    date: format(parseISO(collab.archived_at), "PPP", {
                      locale: dateLocale,
                    }),
                  })}
                </div>
                {collab.archive_reason && (
                  <div className="italic">
                    {t("hr:colaboradores.archivedMeta.reason", {
                      reason: collab.archive_reason,
                    })}
                  </div>
                )}
                {refCounts.data && (
                  <div className="pt-1 text-[11px]">
                    {t("hr:colaboradores.archiveDialog.refs.snapshots", {
                      count: refCounts.data.snapshots,
                    })}{" · "}
                    {t("hr:colaboradores.archiveDialog.refs.vacations", {
                      count: refCounts.data.vacations,
                    })}{" · "}
                    {t("hr:colaboradores.archiveDialog.refs.benefitExpenses", {
                      count: refCounts.data.benefitExpenses,
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 no-print">
          <div className="flex items-center gap-2 rounded-md border px-3 py-1.5">
            <span
              className={cn(
                "text-xs font-medium",
                !collab.archived_at ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {t("hr:collaborator.activeToggle.active")}
            </span>
            <Switch
              checked={!collab.archived_at}
              disabled={archiveMut.isPending || restoreMut.isPending}
              onCheckedChange={(checked) => {
                if (checked) setRestoreOpen(true);
                else setArchiveOpen(true);
              }}
              aria-label={t("hr:collaborator.activeToggle.aria")}
            />
            <span
              className={cn(
                "text-xs font-medium",
                collab.archived_at ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {t("hr:collaborator.activeToggle.inactive")}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> {t("hr:collaborator.printPdf")}
          </Button>
        </div>
      </div>

      <ArchiveCollaboratorDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        collaborator={collab ? { id: collab.id, nome: collab.nome } : null}
        pending={archiveMut.isPending}
        onConfirm={handleArchiveConfirm}
      />

      <RestoreCollaboratorDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        collaborator={
          collab
            ? {
                id: collab.id,
                nome: collab.nome,
                archived_at: collab.archived_at ?? null,
                archive_reason: collab.archive_reason ?? null,
              }
            : null
        }
        pending={restoreMut.isPending}
        onConfirm={handleRestoreConfirm}
      />

      <Card>
        <Collapsible open={dadosOpen} onOpenChange={setDadosOpen}>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex flex-1 items-start gap-2 text-left"
                aria-expanded={dadosOpen}
              >
                <ChevronDown
                  className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                    dadosOpen ? "rotate-0" : "-rotate-90"
                  }`}
                />
                <div className="space-y-1.5">
                  <CardTitle className="text-base">{t("hr:collaborator.details.title")}</CardTitle>
                  <CardDescription>
                    {t("hr:collaborator.details.description")}
                  </CardDescription>
                </div>
              </button>
            </CollapsibleTrigger>
            <div className="flex items-center gap-2">
              {isDirty && (
                <span className="text-xs text-muted-foreground">{t("hr:collaborator.details.dirtyHint")}</span>
              )}
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!isDirty || updateCollab.isPending}
              >
                <Save className="h-4 w-4" />
                {updateCollab.isPending ? t("hr:collaborator.details.saving") : t("hr:collaborator.details.save")}
              </Button>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label={t("hr:collaborator.fields.name")}>
                  <Input
                    className="input-yellow"
                    value={draft.nome}
                    onChange={(e) => setField("nome", e.target.value)}
                  />
                </Field>
                <Field label={t("hr:collaborator.fields.employeeNumber")}>
                  <Input
                    className="input-yellow"
                    value={draft.numero_colaborador ?? ""}
                    onChange={(e) => setField("numero_colaborador", e.target.value || null)}
                  />
                </Field>
                <Field label={t("hr:collaborator.fields.department")}>
                  <Select
                    value={draft.departamento}
                    onValueChange={(v) =>
                      setField("departamento", v as "Projecto" | "Backoffice")
                    }
                  >
                    <SelectTrigger className="input-yellow">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Projecto">{t("hr:enums.department.Projecto")}</SelectItem>
                      <SelectItem value="Backoffice">{t("hr:enums.department.Backoffice")}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t("hr:collaborator.fields.contractStatus")}>
                  <Select
                    value={draft.situacao_contractual ?? ""}
                    onValueChange={(v) => setField("situacao_contractual", v || null)}
                  >
                    <SelectTrigger className="input-yellow">
                      <SelectValue placeholder={t("hr:collaborator.placeholders.selectOption")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Contrato sem termo">{t("hr:collaborator.contractStatus.permanent")}</SelectItem>
                      <SelectItem value="Contrato com termo">{t("hr:collaborator.contractStatus.fixedTerm")}</SelectItem>
                      <SelectItem value="Contrato de tempo indeterminado">
                        {t("hr:collaborator.contractStatus.indefinite")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t("hr:collaborator.fields.birthDate")}>
                  <Input
                    type="date"
                    className="input-yellow"
                    value={draft.data_nascimento ?? ""}
                    onChange={(e) => setField("data_nascimento", e.target.value || null)}
                  />
                </Field>
                <Field label={t("hr:collaborator.fields.careerStart")}>
                  <Input
                    type="date"
                    className="input-yellow"
                    value={draft.inicio_carreira ?? ""}
                    onChange={(e) => setField("inicio_carreira", e.target.value || null)}
                  />
                </Field>
                <Field label={t("hr:collaborator.fields.email")}>
                  <Input
                    type="email"
                    placeholder={t("hr:collaborator.placeholders.emailExample")}
                    className="input-yellow"
                    value={draft.email ?? ""}
                    onChange={(e) => setField("email", e.target.value || null)}
                  />
                </Field>
                <Field label={t("hr:collaborator.fields.vacationDaysPerYear")}>
                  <Input
                    type="number"
                    min={0}
                    className="input-yellow tabular-nums"
                    value={draft.dias_ferias_anuais ?? 22}
                    onChange={(e) => setField("dias_ferias_anuais", Number(e.target.value) || 0)}
                  />
                </Field>
                <Field label={t("hr:collaborator.fields.vacationCarryOver")}>
                  <Input
                    type="number"
                    min={0}
                    className="input-yellow tabular-nums"
                    value={draft.saldo_ferias_anterior ?? 0}
                    onChange={(e) => setField("saldo_ferias_anterior", Number(e.target.value) || 0)}
                  />
                </Field>
                <Field label={t("hr:collaborator.fields.vacationExtraDays")}>
                  <Input
                    type="number"
                    min={0}
                    className="input-yellow tabular-nums"
                    value={draft.dias_ferias_extra ?? 0}
                    onChange={(e) => setField("dias_ferias_extra", Number(e.target.value) || 0)}
                  />
                </Field>
                <Field label={t("hr:collaborator.fields.dailyHours")}>
                  <Input
                    type="number"
                    min={0.5}
                    max={24}
                    step="0.5"
                    className="input-yellow tabular-nums"
                    value={draft.daily_hours ?? 8}
                    onChange={(e) => setField("daily_hours", Number(e.target.value) || 8)}
                  />
                </Field>
                <Field label={t("hr:collaborator.fields.daysPerWeek")}>
                  <Input
                    type="number"
                    min={1}
                    max={7}
                    step="0.5"
                    className="input-yellow tabular-nums"
                    value={draft.days_per_week ?? 5}
                    onChange={(e) => setField("days_per_week", Number(e.target.value) || 5)}
                  />
                </Field>
                {draft.departamento === "Projecto" && (
                  <Field label={t("hr:collaborator.fields.profitMarginOverride")}>
                    <Input
                      type="number"
                      step="0.5"
                      placeholder={t("hr:collaborator.placeholders.usesGlobal")}
                      className="input-yellow tabular-nums"
                      value={
                        draft.margem_lucro_pct_override != null
                          ? (draft.margem_lucro_pct_override * 100).toString()
                          : ""
                      }
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        setField(
                          "margem_lucro_pct_override",
                          v === "" ? null : Number(v) / 100,
                        );
                      }}
                    />
                  </Field>
                )}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <CapacityRecoveryCard
        dailyHours={Number(draft.daily_hours ?? 8)}
        daysPerWeek={Number(draft.days_per_week ?? 5)}
        targetChargeabilityPct={draft.target_chargeability_pct ?? null}
        onChangeTarget={(v) => setField("target_chargeability_pct", v)}
        canEdit={isAdmin}
      />

      {canViewCompensation && (
        <MonthlyLiquidityCard
          snapshot={effectiveSnapshot}
          expenses={benefitExpenses}
        />
      )}

      <Card>
        <Collapsible open={agregadoOpen} onOpenChange={setAgregadoOpen}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer">
              <button
                type="button"
                className="flex w-full items-start gap-2 text-left"
                aria-expanded={agregadoOpen}
              >
                <ChevronDown
                  className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                    agregadoOpen ? "rotate-0" : "-rotate-90"
                  }`}
                />
                <div className="space-y-1.5">
                  <CardTitle className="text-base">{t("hr:collaborator.household.title")}</CardTitle>
                  <CardDescription>
                    {t("hr:collaborator.household.description")}
                  </CardDescription>
                </div>
              </button>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label={t("hr:collaborator.household.location")}>
                  <Select
                    value={draft.localizacao}
                    onValueChange={(v) => setField("localizacao", v)}
                  >
                    <SelectTrigger className="input-yellow"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LOCALIZACOES.map((l) => (
                        <SelectItem key={l.value} value={l.value}>{t(`hr:enums.location.${l.value}`, { defaultValue: l.label })}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t("hr:collaborator.household.maritalStatus")}>
                  <Select
                    value={draft.estado_civil}
                    onValueChange={(v) => setField("estado_civil", v)}
                  >
                    <SelectTrigger className="input-yellow"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ESTADOS_CIVIS.map((e) => (
                        <SelectItem key={e.value} value={e.value}>{t(`hr:enums.maritalStatus.${e.value}`, { defaultValue: e.label })}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t("hr:collaborator.household.titulares")}>
                  <Input
                    type="number"
                    min={1}
                    max={2}
                    className="input-yellow tabular-nums"
                    value={draft.numero_titulares}
                    onChange={(e) => setField("numero_titulares", Number(e.target.value) || 1)}
                  />
                </Field>
                <Field label={t("hr:collaborator.household.dependents")}>
                  <Input
                    type="number"
                    min={0}
                    className="input-yellow tabular-nums"
                    value={draft.numero_dependentes}
                    onChange={(e) => setField("numero_dependentes", Number(e.target.value) || 0)}
                  />
                </Field>
                <Field label={t("hr:collaborator.household.dependentsDisability")}>
                  <Input
                    type="number"
                    min={0}
                    className="input-yellow tabular-nums"
                    value={draft.dependentes_com_deficiencia}
                    onChange={(e) => setField("dependentes_com_deficiencia", Number(e.target.value) || 0)}
                  />
                </Field>
                <Field label={t("hr:collaborator.household.fiscalYear")}>
                  <Select
                    value={String(draft.ano_fiscal)}
                    onValueChange={(v) => setField("ano_fiscal", Number(v))}
                  >
                    <SelectTrigger className="input-yellow"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[2023, 2024, 2025, 2026].map((y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y}{y !== 2026 ? t("hr:collaborator.household.yearNoIrsTable") : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <CommercialRoleCard collaborator={draft} />

      <ResourceClassificationCard
        collaborator={draft}
        snapshot={canViewCompensation ? effectiveSnapshot : null}
        showCost={canViewCompensation}
        canEdit={isAdmin}
        onChange={(next: { classification: "project" | "backoffice" | "hybrid"; backofficePct: number }) => {
          setField("resource_classification", next.classification);
          setField("backoffice_pct", next.backofficePct);
        }}
      />




      {!canViewCompensation ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("hr:compensationGate.title")}</CardTitle>
            <CardDescription>{t("hr:compensationGate.description")}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div>
          <Tabs value={tabValue} onValueChange={setActiveTab}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <TabsList className="h-auto flex-wrap">
                {snapshots.map((s) => (
                  <TabsTrigger key={s.id} value={s.id} className="gap-2">
                    <span>{s.label}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {fmtSnapshotDate(s.reference_date)}
                    </span>
                    {s.is_effective && (
                      <span className="rounded-full bg-positive/15 px-1.5 py-0.5 text-[10px] font-semibold text-positive">
                        {t("hr:myProfile.inForce")}
                      </span>
                    )}
                  </TabsTrigger>
                ))}
                <TabsTrigger value="resumo" className="gap-1">
                  <BarChart3 className="h-3 w-3" /> {t("hr:collaborator.snapshots.summaryTab")}
                </TabsTrigger>
              </TabsList>

              <Dialog open={newOpen} onOpenChange={(o) => !collab.archived_at && setNewOpen(o)}>
                <DialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!collab.archived_at}
                    title={
                      collab.archived_at
                        ? t("hr:collaborator.snapshots.archivedBlocked")
                        : undefined
                    }
                  >
                    <Plus className="h-4 w-4" /> {t("hr:collaborator.snapshots.newButton")}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("hr:collaborator.newDialog.title")}</DialogTitle>
                    <DialogDescription>
                      {t("hr:collaborator.newDialog.description")}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label={t("hr:collaborator.newDialog.label")}>
                      <Input
                        className="input-yellow"
                        value={newForm.label}
                        onChange={(e) => setNewForm((f) => ({ ...f, label: e.target.value }))}
                      />
                    </Field>
                    <Field label={t("hr:collaborator.newDialog.referenceDate")}>
                      <Input
                        type="date"
                        className="input-yellow"
                        value={newForm.reference_date}
                        onChange={(e) =>
                          setNewForm((f) => ({ ...f, reference_date: e.target.value }))
                        }
                      />
                    </Field>
                    <Field label={t("hr:collaborator.newDialog.copyFrom")}>
                      <Select
                        value={newForm.copyFrom || "none"}
                        onValueChange={(v) =>
                          setNewForm((f) => ({ ...f, copyFrom: v === "none" ? "" : v }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("hr:collaborator.newDialog.copyFromBlank")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("hr:collaborator.newDialog.copyFromBlank")}</SelectItem>
                          {snapshots.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.label} · {fmtSnapshotDate(s.reference_date)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label={t("hr:collaborator.newDialog.effective")}>
                      <div className="flex h-9 items-center">
                        <Switch
                          checked={newForm.is_effective}
                          onCheckedChange={(v) =>
                            setNewForm((f) => ({ ...f, is_effective: v }))
                          }
                        />
                      </div>
                    </Field>
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setNewOpen(false)}>
                      {t("hr:collaborator.newDialog.cancel")}
                    </Button>
                    <Button onClick={() => createSnap.mutate()} disabled={createSnap.isPending}>
                      {t("hr:collaborator.newDialog.create")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {snapshots.length === 0 && (
              <Card className="mt-4">
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  {t("hr:collaborator.snapshots.empty")}
                </CardContent>
              </Card>
            )}

            {snapshots.map((s) => (
              <TabsContent key={s.id} value={s.id} className="mt-4 space-y-6">
                <SnapshotMirrorPanel
                  snapshot={s}
                  collaborator={draft}
                  allSnapshots={snapshots}
                  selectedId={s.id}
                  expenses={benefitExpenses}
                  showSnapshotPicker={false}
                />
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      {t("hr:collaborator.snapshots.editorTitle")}
                    </CardTitle>
                    <CardDescription>
                      {t("hr:collaborator.snapshots.editorDescription")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SnapshotForm snapshot={s} collaborator={draft} />
                  </CardContent>
                </Card>
              </TabsContent>
            ))}

            <TabsContent value="resumo" className="mt-4">
              <ResumoCompare snapshots={snapshots} expenses={benefitExpenses} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

/**
 * Maps the (currently free-text) `situacao_contractual` column values to a
 * canonical key for translation. Falls back to the raw string for unknown
 * legacy values via the caller's `defaultValue` option.
 */
function contractStatusKey(value: string): "permanent" | "fixedTerm" | "indefinite" {
  switch (value) {
    case "Contrato sem termo":
      return "permanent";
    case "Contrato com termo":
      return "fixedTerm";
    case "Contrato de tempo indeterminado":
      return "indefinite";
    default:
      return "permanent";
  }
}

function CapacityRecoveryCard({
  dailyHours,
  daysPerWeek,
  targetChargeabilityPct,
  onChangeTarget,
  canEdit,
}: {
  dailyHours: number;
  daysPerWeek: number;
  targetChargeabilityPct: number | null;
  onChangeTarget: (value: number | null) => void;
  canEdit: boolean;
}) {
  const { t, i18n } = useTranslation(["hr"]);
  const weeklyCapacity = computeWeeklyCapacity(dailyHours, daysPerWeek);
  const fte = computeCollaboratorFte(dailyHours, daysPerWeek);
  const recoverable = computeRecoverableHours(weeklyCapacity, targetChargeabilityPct);
  const fteLabel = new Intl.NumberFormat(i18n.language, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(fte);
  const targetLabel = formatChargeabilityPct(targetChargeabilityPct, i18n.language);
  const notDefined = t("hr:collaborator.capacityRecovery.notDefined");

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {t("hr:collaborator.capacityRecovery.title")}
        </CardTitle>
        <CardDescription>
          {t("hr:collaborator.capacityRecovery.help")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <ReadOnlyStat
            label={t("hr:collaborator.capacityRecovery.dailyHours")}
            value={formatHoursPerWeek(dailyHours, i18n.language)}
          />
          <ReadOnlyStat
            label={t("hr:collaborator.capacityRecovery.daysPerWeek")}
            value={formatHoursPerWeek(daysPerWeek, i18n.language)}
          />
          <ReadOnlyStat
            label={t("hr:collaborator.capacityRecovery.weeklyCapacity")}
            value={`${formatHoursPerWeek(weeklyCapacity, i18n.language)} h`}
          />
          <ReadOnlyStat
            label={t("hr:collaborator.capacityRecovery.fte")}
            value={fteLabel}
            hint={t("hr:collaborator.capacityRecovery.fteHint")}
          />
          <ReadOnlyStat
            label={t("hr:collaborator.capacityRecovery.targetChargeability")}
            value={targetLabel ?? notDefined}
            muted={targetLabel == null}
          />
          <ReadOnlyStat
            label={t("hr:collaborator.capacityRecovery.recoverableHours")}
            value={
              recoverable == null
                ? notDefined
                : `${formatHoursPerWeek(recoverable, i18n.language)} h`
            }
            muted={recoverable == null}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("hr:collaborator.capacityRecovery.editLabel")}>
            <Input
              type="number"
              min={0}
              max={100}
              step="1"
              placeholder={notDefined}
              disabled={!canEdit}
              className="input-yellow tabular-nums"
              value={targetChargeabilityPct ?? ""}
              onChange={(e) => {
                const raw = e.target.value.trim();
                if (raw === "") {
                  onChangeTarget(null);
                  return;
                }
                const n = Number(raw);
                if (!Number.isFinite(n)) {
                  onChangeTarget(null);
                  return;
                }
                onChangeTarget(Math.max(0, Math.min(100, n)));
              }}
            />
          </Field>
          <div className="text-xs text-muted-foreground self-end pb-2">
            {canEdit
              ? t("hr:collaborator.capacityRecovery.editHint")
              : t("hr:collaborator.capacityRecovery.readOnlyHint")}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReadOnlyStat({
  label,
  value,
  hint,
  muted,
}: {
  label: string;
  value: string;
  hint?: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 text-base font-semibold tabular-nums",
          muted && "text-muted-foreground font-normal italic",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

type ResourceClass = "project" | "backoffice" | "hybrid";

function ResourceClassificationCard({
  collaborator,
  snapshot,
  showCost,
  canEdit,
  onChange,
}: {
  collaborator: Collaborator;
  snapshot: Snapshot | null;
  showCost: boolean;
  canEdit: boolean;
  onChange: (next: { classification: ResourceClass; backofficePct: number }) => void;
}) {
  const { t } = useTranslation(["hr"]);
  // Apply a sensible default for legacy collaborators where the classification
  // is still NULL: Backoffice department → "backoffice", everyone else → "project".
  const effectiveClassification: ResourceClass =
    (collaborator.resource_classification as ResourceClass | null) ??
    (collaborator.departamento === "Backoffice" ? "backoffice" : "project");
  const effectiveBoPct =
    collaborator.backoffice_pct ??
    (collaborator.departamento === "Backoffice" ? 100 : 0);

  // Single source of truth for the split math.
  const split = getResourceSplit({
    resource_classification: effectiveClassification,
    backoffice_pct: effectiveBoPct,
    daily_hours: collaborator.daily_hours,
    days_per_week: collaborator.days_per_week,
  });
  const costSplit = showCost
    ? splitMonthlyCompanyCostFromSnapshot(
        {
          resource_classification: effectiveClassification,
          backoffice_pct: effectiveBoPct,
        },
        snapshot,
      )
    : null;

  const handleClassChange = (next: ResourceClass) => {
    let nextPct = split.backoffice_pct;
    if (next === "project") nextPct = 0;
    else if (next === "backoffice") nextPct = 100;
    else if (next === "hybrid")
      nextPct = effectiveClassification === "hybrid" ? split.backoffice_pct : 80;
    onChange({ classification: next, backofficePct: nextPct });
  };

  const handleBoChange = (v: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(v)));
    onChange({ classification: "hybrid", backofficePct: clamped });
  };

  const fmtPct = (n: number) => `${n.toFixed(0)}%`;
  const fmtFte = (n: number) => n.toFixed(2);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("hr:collaborator.resourceClassification.title")}</CardTitle>
        <CardDescription>{t("hr:collaborator.resourceClassification.help")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label={t("hr:collaborator.resourceClassification.field")}>
            <Select
              value={split.resource_classification}
              onValueChange={(v) => handleClassChange(v as ResourceClass)}
              disabled={!canEdit}
            >
              <SelectTrigger className={canEdit ? "input-yellow" : undefined}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="project">{t("hr:collaborator.resourceClassification.options.project")}</SelectItem>
                <SelectItem value="backoffice">{t("hr:collaborator.resourceClassification.options.backoffice")}</SelectItem>
                <SelectItem value="hybrid">{t("hr:collaborator.resourceClassification.options.hybrid")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("hr:collaborator.resourceClassification.backofficePct")}>
            <Input
              type="number"
              min={0}
              max={100}
              step={5}
              className={cn(
                "tabular-nums",
                split.resource_classification === "hybrid" && canEdit ? "input-yellow" : undefined,
              )}
              value={split.backoffice_pct}
              disabled={!canEdit || split.resource_classification !== "hybrid"}
              onChange={(e) => handleBoChange(Number(e.target.value))}
            />
          </Field>
          <Field label={t("hr:collaborator.resourceClassification.projectPct")}>
            <Input type="number" className="tabular-nums" value={split.project_pct} disabled readOnly />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ReadOnlyStat
            label={t("hr:collaborator.resourceClassification.fte")}
            value={fmtFte(split.fte)}
            hint={t("hr:collaborator.resourceClassification.fteHint")}
          />
          <ReadOnlyStat
            label={t("hr:collaborator.resourceClassification.boFte")}
            value={`${fmtFte(split.bo_fte_equivalent)} (${fmtPct(split.backoffice_pct)})`}
          />
          <ReadOnlyStat
            label={t("hr:collaborator.resourceClassification.projectFte")}
            value={`${fmtFte(split.project_fte_equivalent)} (${fmtPct(split.project_pct)})`}
          />
        </div>

        {costSplit && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <ReadOnlyStat
                label={t("hr:collaborator.resourceClassification.monthlyCostTotal")}
                value={fmtEUR(costSplit.total_monthly_cost)}
                hint={t("hr:collaborator.resourceClassification.monthlyCostTotalHint")}
              />
              <ReadOnlyStat
                label={t("hr:collaborator.resourceClassification.monthlyCostBo")}
                value={`${fmtEUR(costSplit.backoffice_cost)} (${fmtPct(costSplit.backoffice_pct)})`}
              />
              <ReadOnlyStat
                label={t("hr:collaborator.resourceClassification.monthlyCostProject")}
                value={`${fmtEUR(costSplit.project_capacity_cost)} (${fmtPct(costSplit.project_pct)})`}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t("hr:collaborator.resourceClassification.costSplitDisclaimer")}
            </p>
          </>
        )}

        {!canEdit && (
          <p className="text-[11px] text-muted-foreground">
            {t("hr:collaborator.resourceClassification.readOnlyHint")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}



