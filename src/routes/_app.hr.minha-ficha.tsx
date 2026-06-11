import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  type Collaborator,
  type Snapshot,
  fmtEUR,
} from "@/lib/salary";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CircleAlert, FileText, CalendarDays, Wallet, ArrowRight, Printer } from "lucide-react";
import { balanceByCategory, type BenefitBalance, type BenefitExpense, type BenefitYearlyCredit } from "@/lib/benefits";
import { SnapshotMirrorPanel } from "@/components/snapshot/SnapshotMirrorPanel";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export const Route = createFileRoute("/_app/hr/minha-ficha")({
  component: MinhaFichaPage,
});

function MinhaFichaPage() {
  const { t } = useTranslation(["hr", "common"]);
  const { user, viewAsCollaboratorId } = useAuth();
  const email = user?.email ?? null;

  // 1. Procura o colaborador: por id (se admin a impersonar) ou pelo email da sessão
  const { data: collaborator, isLoading: loadingCollab } = useQuery({
    queryKey: ["my-collaborator", viewAsCollaboratorId ?? email],
    enabled: !!(viewAsCollaboratorId || email),
    queryFn: async () => {
      const q = supabase.from("collaborators").select("*");
      const { data, error } = viewAsCollaboratorId
        ? await q.eq("id", viewAsCollaboratorId).maybeSingle()
        : await q.eq("email", email!).maybeSingle();
      if (error) throw error;
      return data as Collaborator | null;
    },
  });

  // 2. Carrega as fichas do colaborador (RLS garante que só vê as próprias)
  const { data: snapshots = [], isLoading: loadingSnaps } = useQuery({
    queryKey: ["my-snapshots", collaborator?.id],
    enabled: !!collaborator?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salary_snapshots")
        .select("*")
        .eq("collaborator_id", collaborator!.id)
        .order("reference_date", { ascending: false });
      if (error) throw error;
      return data as Snapshot[];
    },
  });

  const ordered = useMemo(() => {
    // efectiva primeiro, depois por data desc
    return [...snapshots].sort((a, b) => {
      if (a.is_effective !== b.is_effective) return a.is_effective ? -1 : 1;
      return (b.reference_date ?? "").localeCompare(a.reference_date ?? "");
    });
  }, [snapshots]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    ordered.find((s) => s.id === selectedId) ?? ordered[0] ?? null;

  if (loadingCollab) {
    return (
      <div className="text-sm text-muted-foreground">
        {t("hr:myProfile.loadingProfile")}
      </div>
    );
  }

  if (!collaborator) {
    return (
      <Card className="border-clay/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CircleAlert className="h-4 w-4" /> {t("hr:myProfile.notFoundTitle")}
          </CardTitle>
          <CardDescription>
            {t("hr:myProfile.notFoundDescription", { email: email ?? "" })}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("hr:myProfile.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("hr:myProfile.subtitle")}
        </p>
      </div>

      {/* Cabeçalho do colaborador */}
      <Card>
        <CardHeader>
          <CardDescription>{t("hr:myProfile.collaboratorLabel")}</CardDescription>
          <CardTitle className="text-lg">{collaborator.nome}</CardTitle>
          <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-muted-foreground">
            {collaborator.numero_colaborador && (
              <span>
                {t("hr:myProfile.employeeNumberShort", {
                  number: collaborator.numero_colaborador,
                })}
              </span>
            )}
            <span>·</span>
            <span>{collaborator.departamento}</span>
            {collaborator.email && (
              <>
                <span>·</span>
                <span>{collaborator.email}</span>
              </>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Atalhos: Férias + Benefícios */}
      <QuickLinks collaborator={collaborator} />

      {loadingSnaps ? (
        <div className="text-sm text-muted-foreground">
          {t("hr:myProfile.loadingSnapshots")}
        </div>
      ) : ordered.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("hr:myProfile.noSnapshotsTitle")}
            </CardTitle>
            <CardDescription>
              {t("hr:myProfile.noSnapshotsDescription")}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        selected && (
          <SnapshotMirrorPanel
            snapshot={selected}
            collaborator={collaborator}
            allSnapshots={ordered}
            selectedId={selected.id}
            onSelect={setSelectedId}
          />
        )
      )}

      <p className="text-[11px] text-muted-foreground">
        <FileText className="mr-1 inline h-3 w-3" />
        {t("hr:myProfile.footerReadOnly")}{" "}
        <Link to="/hr/beneficios" className="underline underline-offset-2">
          {t("hr:myProfile.footerBenefitsLink")}
        </Link>
        {t("hr:myProfile.footerSuffix")}
      </p>
    </div>
  );
}

// =============================================================
// Atalhos para Férias e Benefícios
// =============================================================
function QuickLinks({ collaborator }: { collaborator: Collaborator }) {
  const { t } = useTranslation(["hr"]);
  const year = new Date().getFullYear();

  const { data: vacationDays = 0 } = useQuery({
    queryKey: ["my-vacation-days", collaborator.id, year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vacation_requests")
        .select("dias_uteis, tipo, estado, data_inicio")
        .eq("collaborator_id", collaborator.id)
        .in("estado", ["pendente", "aprovada"])
        .gte("data_inicio", `${year}-01-01`)
        .lte("data_inicio", `${year}-12-31`);
      if (error) throw error;
      return (data ?? [])
        .filter((r: { tipo: string }) => r.tipo === "ferias")
        .reduce(
          (sum: number, r: { dias_uteis: number }) => sum + (Number(r.dias_uteis) || 0),
          0,
        );
    },
  });

  const { data: benefitsAvailable = 0 } = useQuery({
    queryKey: ["my-benefits-available", collaborator.id],
    queryFn: async () => {
      const [balRes, credRes, expRes] = await Promise.all([
        sb.from("benefit_balances").select("*").eq("collaborator_id", collaborator.id),
        sb.from("benefit_yearly_credits").select("*").eq("collaborator_id", collaborator.id),
        supabase
          .from("benefit_expenses")
          .select("*")
          .eq("collaborator_id", collaborator.id),
      ]);
      if (balRes.error) throw balRes.error;
      if (credRes.error) throw credRes.error;
      if (expRes.error) throw expRes.error;
      const balance = balanceByCategory({
        balances: (balRes.data ?? []) as BenefitBalance[],
        credits: (credRes.data ?? []) as BenefitYearlyCredit[],
        expenses: (expRes.data ?? []) as BenefitExpense[],
      });
      return (
        balance.carro.disponivel +
        balance.ticket.disponivel +
        balance.premio.disponivel +
        balance.outros.disponivel
      );
    },
  });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Link
        to="/hr/ferias"
        className="group rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CalendarDays className="h-4 w-4 text-[var(--hr-accent)]" />
              {t("hr:myProfile.quickLinks.vacationTitle")}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("hr:myProfile.quickLinks.vacationSubtitle")}
            </p>
            <div className="pt-2 text-xs">
              <span className="font-semibold tabular-nums">{vacationDays}</span>{" "}
              <span className="text-muted-foreground">
                {t("hr:myProfile.quickLinks.vacationDaysThisYear", { year })}
              </span>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </div>
      </Link>

      <Link
        to="/hr/beneficios"
        className="group rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Wallet className="h-4 w-4 text-[var(--hr-accent)]" />
              {t("hr:myProfile.quickLinks.benefitsTitle")}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("hr:myProfile.quickLinks.benefitsSubtitle")}
            </p>
            <div className="pt-2 text-xs">
              <span className="font-semibold tabular-nums">{fmtEUR(benefitsAvailable)}</span>{" "}
              <span className="text-muted-foreground">
                {t("hr:myProfile.quickLinks.benefitsAvailable")}
              </span>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </div>
      </Link>
    </div>
  );
}
