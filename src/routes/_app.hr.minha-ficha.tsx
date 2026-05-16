import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  type Collaborator,
  type Snapshot,
  SUBSIDIOS_MODO_OPTIONS,
  computeSnapshot,
  fmtEUR,
  fmtDate,
} from "@/lib/salary";
import { ResumoCompare } from "@/components/ResumoCompare";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ValueChainSummary } from "@/components/snapshot/ValueChainSummary";
import { LiquidoTab } from "@/components/snapshot/LiquidoTab";
import { BrutoTab } from "@/components/snapshot/BrutoTab";
import { CircleAlert, FileText } from "lucide-react";

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
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_1fr]">
          {/* Lista lateral de fichas */}
          <Card className="lg:sticky lg:top-2 lg:self-start">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {t("hr:myProfile.history")}
              </CardTitle>
              <CardDescription className="text-xs">
                {t("hr:myProfile.historyCount", { count: ordered.length })}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-2 pb-3 pt-0">
              <ul className="flex flex-col gap-1">
                {ordered.map((s) => {
                  const active = (selected?.id ?? null) === s.id;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(s.id)}
                        className={
                          "w-full rounded-md px-2.5 py-2 text-left text-sm transition-colors " +
                          (active
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent")
                        }
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium">{s.label}</span>
                          {s.is_effective && (
                            <Badge
                              variant={active ? "secondary" : "default"}
                              className="shrink-0 text-[10px]"
                            >
                              {t("hr:myProfile.inForce")}
                            </Badge>
                          )}
                        </div>
                        <div
                          className={
                            "text-[11px] " +
                            (active
                              ? "text-primary-foreground/80"
                              : "text-muted-foreground")
                          }
                        >
                          {fmtDate(s.reference_date)}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          {/* Detalhe */}
          {selected && (
            <SnapshotReadOnly
              snapshot={selected}
              collaborator={collaborator}
              allSnapshots={ordered}
            />
          )}
        </div>
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

function SnapshotReadOnly({
  snapshot,
  collaborator,
}: {
  snapshot: Snapshot;
  collaborator: Collaborator;
}) {
  const { t } = useTranslation(["hr"]);
  // Espelha o agregado familiar do colaborador, tal como faz a ficha completa
  const draftEffective: Snapshot = {
    ...snapshot,
    localizacao: collaborator.localizacao,
    estado_civil: collaborator.estado_civil,
    numero_titulares: collaborator.numero_titulares,
    numero_dependentes: collaborator.numero_dependentes,
    dependentes_com_deficiencia: collaborator.dependentes_com_deficiencia,
    ano_fiscal: collaborator.ano_fiscal,
  };
  const c = computeSnapshot(draftEffective);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardDescription>{t("hr:myProfile.snapshotLabel")}</CardDescription>
              <CardTitle className="text-lg">{snapshot.label}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {t("hr:myProfile.referenceDate", {
                  date: fmtDate(snapshot.reference_date),
                })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {snapshot.is_effective ? (
                <Badge>{t("hr:myProfile.inForce")}</Badge>
              ) : (
                <Badge variant="secondary">
                  {t("hr:myProfile.historical")}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Mini
            label={t("hr:myProfile.mini.grossMonthly")}
            value={fmtEUR(c.brutoMensal)}
          />
          <Mini
            label={t("hr:myProfile.mini.netMonthly")}
            value={fmtEUR(c.liquido14m)}
          />
          <Mini
            label={t("hr:myProfile.mini.netAnnual")}
            value={fmtEUR(c.liquidoAnual)}
          />
          <Mini
            label={t("hr:myProfile.mini.employerCostAnnual")}
            value={fmtEUR(c.custoVBG)}
          />
        </CardContent>
      </Card>

      <ValueChainSummary c={c} />

      <Tabs defaultValue="liquido">
        <TabsList>
          <TabsTrigger value="liquido">
            {t("hr:myProfile.tabs.net")}
          </TabsTrigger>
          <TabsTrigger value="bruto">
            {t("hr:myProfile.tabs.gross")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="liquido">
          <LiquidoTab draft={draftEffective} />
        </TabsContent>
        <TabsContent value="bruto">
          <BrutoTab draft={draftEffective} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
