import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  type Collaborator,
  type Snapshot,
  computeSnapshot,
  fmtEUR,
  fmtDate,
} from "@/lib/salary";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ValueChainSummary } from "@/components/snapshot/ValueChainSummary";
import { SnapshotPanel } from "@/components/snapshot/SnapshotPanel";
import { CircleAlert, FileText } from "lucide-react";

export const Route = createFileRoute("/_app/minha-ficha")({
  component: MinhaFichaPage,
});

function MinhaFichaPage() {
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
      <div className="text-sm text-muted-foreground">A carregar a sua ficha…</div>
    );
  }

  if (!collaborator) {
    return (
      <Card className="border-clay/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CircleAlert className="h-4 w-4" /> Ficha não encontrada
          </CardTitle>
          <CardDescription>
            Não conseguimos associar a sua sessão ({email}) a um colaborador.
            Contacte o Backoffice para verificar o email registado.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Minha ficha</h1>
        <p className="text-sm text-muted-foreground">
          Consulta das suas fichas salariais — efectiva e histórico.
        </p>
      </div>

      {/* Cabeçalho do colaborador */}
      <Card>
        <CardHeader>
          <CardDescription>Colaborador</CardDescription>
          <CardTitle className="text-lg">{collaborator.nome}</CardTitle>
          <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-muted-foreground">
            {collaborator.numero_colaborador && (
              <span>Nº {collaborator.numero_colaborador}</span>
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
        <div className="text-sm text-muted-foreground">A carregar fichas…</div>
      ) : ordered.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sem fichas registadas</CardTitle>
            <CardDescription>
              Ainda não existe nenhuma ficha salarial associada à sua conta.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_1fr]">
          {/* Lista lateral de fichas */}
          <Card className="lg:sticky lg:top-2 lg:self-start">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Histórico</CardTitle>
              <CardDescription className="text-xs">
                {ordered.length} ficha{ordered.length === 1 ? "" : "s"}
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
                              Em vigor
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
            <SnapshotReadOnly snapshot={selected} collaborator={collaborator} />
          )}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        <FileText className="mr-1 inline h-3 w-3" />
        Esta página é apenas de consulta. Para qualquer alteração contacte o
        Backoffice. Em caso de dúvida visite a secção de{" "}
        <Link to="/beneficios" className="underline underline-offset-2">
          Benefícios
        </Link>
        .
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
              <CardDescription>Ficha</CardDescription>
              <CardTitle className="text-lg">{snapshot.label}</CardTitle>
              <p className="text-xs text-muted-foreground">
                Data de referência: {fmtDate(snapshot.reference_date)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {snapshot.is_effective ? (
                <Badge>Em vigor</Badge>
              ) : (
                <Badge variant="secondary">Histórico</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Mini label="Bruto mensal" value={fmtEUR(c.brutoMensal)} />
          <Mini label="Líquido mensal" value={fmtEUR(c.liquido14m)} />
          <Mini label="Líquido anual" value={fmtEUR(c.liquidoAnual)} />
          <Mini label="Custo empregador (anual)" value={fmtEUR(c.custoVBG)} />
        </CardContent>
      </Card>

      <ValueChainSummary c={c} />

      <SnapshotPanel draft={draftEffective} mode="readonly" />
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
