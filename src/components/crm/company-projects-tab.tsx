import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Briefcase } from "lucide-react";

type ProjectRow = {
  id: string;
  name: string;
  status: string | null;
  start_date: string | null;
  company_id: string | null;
  account_id: string | null;
};

type LinkedProject = ProjectRow & { via: "company" | "account" | "invoice" };

const STATUS_LABEL: Record<string, string> = {
  active: "Em curso",
  planned: "Planeado",
  on_hold: "Suspenso",
  completed: "Concluído",
  cancelled: "Cancelado",
  archived: "Arquivado",
};

const DONE = new Set(["completed", "cancelled", "archived"]);

/** Work history for a company: projects linked directly, via a billing account, or via invoices. */
export function CompanyProjectsTab({ companyId }: { companyId: string }) {
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["company-projects", companyId],
    queryFn: async (): Promise<LinkedProject[]> => {
      const cols = "id,name,status,start_date,company_id,account_id";

      const [accountsRes, directRes, docsRes] = await Promise.all([
        supabase.from("crm_accounts").select("id").eq("company_id", companyId),
        supabase.from("pm_projects").select(cols).eq("company_id", companyId),
        supabase
          .from("financial_documents")
          .select("project_id")
          .not("project_id", "is", null)
          .or(`counterparty_client_id.eq.${companyId},counterparty_supplier_id.eq.${companyId}`),
      ]);
      if (directRes.error) throw directRes.error;

      const map = new Map<string, LinkedProject>();
      for (const p of (directRes.data ?? []) as ProjectRow[]) map.set(p.id, { ...p, via: "company" });

      const accountIds = (accountsRes.data ?? []).map((a: { id: string }) => a.id);
      if (accountIds.length) {
        const { data } = await supabase.from("pm_projects").select(cols).in("account_id", accountIds);
        for (const p of (data ?? []) as ProjectRow[]) if (!map.has(p.id)) map.set(p.id, { ...p, via: "account" });
      }

      const docProjectIds = Array.from(
        new Set(((docsRes.data ?? []) as { project_id: string | null }[]).map((d) => d.project_id).filter(Boolean)),
      ) as string[];
      const missing = docProjectIds.filter((id) => !map.has(id));
      if (missing.length) {
        const { data } = await supabase.from("pm_projects").select(cols).in("id", missing);
        for (const p of (data ?? []) as ProjectRow[]) map.set(p.id, { ...p, via: "invoice" });
      }

      return Array.from(map.values()).sort((a, b) => (b.start_date ?? "").localeCompare(a.start_date ?? ""));
    },
  });

  const ongoing = projects.filter((p) => !DONE.has(p.status ?? ""));
  const finished = projects.filter((p) => DONE.has(p.status ?? ""));

  return (
    <Card>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">A carregar…</div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-6 text-sm text-muted-foreground">
            <Briefcase className="h-6 w-6 opacity-50" />
            Nenhum trabalho associado.
          </div>
        ) : (
          <div>
            <Section title="Em curso" rows={ongoing} />
            <Section title="Histórico" rows={finished} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Section({ title, rows }: { title: string; rows: LinkedProject[] }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="border-b bg-muted/30 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title} ({rows.length})
      </div>
      <ul className="divide-y">
        {rows.map((p) => (
          <li key={p.id} className="hover:bg-muted/30">
            <Link
              to="/projects/$projectId"
              params={{ projectId: p.id }}
              className="flex flex-wrap items-center justify-between gap-3 p-3"
            >
              <div>
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-muted-foreground">
                  Início: {p.start_date ? new Date(p.start_date).toLocaleDateString("pt-PT") : "—"}
                  {p.via !== "company" && (
                    <span> · ligado via {p.via === "account" ? "conta de facturação" : "facturas"}</span>
                  )}
                </div>
              </div>
              <Badge variant={DONE.has(p.status ?? "") ? "outline" : "secondary"}>
                {STATUS_LABEL[p.status ?? ""] ?? p.status ?? "—"}
              </Badge>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
