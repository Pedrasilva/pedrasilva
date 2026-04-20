import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, Search } from "lucide-react";
import type { Company } from "@/lib/crm/types";

export const Route = createFileRoute("/_app/crm/companies")({
  component: CompaniesList,
});

function statusVariant(s: Company["status"]): "default" | "secondary" | "outline" {
  if (s === "activo") return "default";
  if (s === "prospecto") return "secondary";
  return "outline";
}

function CompaniesList() {
  const [q, setQ] = useState("");
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

  const filtered = companies.filter((c) => {
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
      <div className="flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
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

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Indústria</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Telefone</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    A carregar…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    <div className="flex flex-col items-center gap-2 py-6">
                      <Building2 className="h-6 w-6 opacity-50" />
                      Nenhuma empresa. Use o botão “Novo” no topo para criar.
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((c) => (
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
                    <Badge variant={statusVariant(c.status)} className="capitalize">
                      {c.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.industria ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.email ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.telefone ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
