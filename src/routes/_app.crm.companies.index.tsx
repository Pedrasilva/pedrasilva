import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Search, AlertTriangle } from "lucide-react";
import type { Company } from "@/lib/crm/types";

export const Route = createFileRoute("/_app/crm/companies/")({
  component: CompaniesList,
});

type Relationship = "client" | "supplier" | "both" | "uncategorized";
type TabKey = "all" | Relationship;

const RELATIONSHIP_LABEL: Record<Relationship, string> = {
  client: "Cliente",
  supplier: "Fornecedor",
  both: "Ambos",
  uncategorized: "Sem categoria",
};

function statusVariant(s: Company["status"]): "default" | "secondary" | "outline" {
  if (s === "activo") return "default";
  if (s === "prospecto") return "secondary";
  return "outline";
}

function relationshipVariant(r: Relationship): "default" | "secondary" | "outline" | "destructive" {
  if (r === "client") return "default";
  if (r === "supplier") return "secondary";
  if (r === "both") return "outline";
  return "destructive";
}

function CompaniesList() {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<TabKey>("all");

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .order("nome");
      if (error) throw error;
      return data as Company[];
    },
  });

  const counts = useMemo(() => {
    const base: Record<Relationship, number> = {
      client: 0,
      supplier: 0,
      both: 0,
      uncategorized: 0,
    };
    for (const c of companies) {
      const r = (c.relationship_type ?? "uncategorized") as Relationship;
      base[r] = (base[r] ?? 0) + 1;
    }
    return base;
  }, [companies]);

  const filtered = companies.filter((c) => {
    const r = (c.relationship_type ?? "uncategorized") as Relationship;
    if (tab !== "all" && r !== tab) return false;
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return (
      c.nome.toLowerCase().includes(needle) ||
      (c.industria ?? "").toLowerCase().includes(needle) ||
      (c.email ?? "").toLowerCase().includes(needle)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList>
            <TabsTrigger value="all">Todas ({companies.length})</TabsTrigger>
            <TabsTrigger value="client">Clientes ({counts.client})</TabsTrigger>
            <TabsTrigger value="supplier">Fornecedores ({counts.supplier})</TabsTrigger>
            <TabsTrigger value="both">Ambos ({counts.both})</TabsTrigger>
            <TabsTrigger value="uncategorized">
              Sem categoria ({counts.uncategorized})
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Procurar empresas…"
            className="pl-8"
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {filtered.length} de {companies.length}
        </div>
      </div>

      {counts.uncategorized > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium">
              {counts.uncategorized} empresas sem categoria
            </p>
            <p className="text-muted-foreground">
              Sem documentos financeiros, oportunidades ou projectos associados — provável
              dados antigos da importação PHC. Sinalizadas para revisão manual; nada é
              arquivado automaticamente.
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Relação</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Indústria</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Telefone</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    A carregar…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    <div className="flex flex-col items-center gap-2 py-6">
                      <Building2 className="h-6 w-6 opacity-50" />
                      Nenhuma empresa. Use o botão “Novo” no topo para criar.
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((c) => {
                const r = (c.relationship_type ?? "uncategorized") as Relationship;
                return (
                  <TableRow key={c.id} className="cursor-pointer">
                    <TableCell>
                      <Link
                        to="/crm/companies/$companyId"
                        params={{ companyId: c.id }}
                        className="font-medium hover:underline"
                      >
                        {c.nome}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={relationshipVariant(r)}>{RELATIONSHIP_LABEL[r]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(c.status)} className="capitalize">
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.industria ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{c.email ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{c.telefone ?? "—"}</TableCell>
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

