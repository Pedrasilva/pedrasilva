import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Search } from "lucide-react";
import { contactFullName, type Contact, type Company } from "@/lib/crm/types";

export const Route = createFileRoute("/_app/crm/contacts")({
  component: ContactsList,
});

type Row = Contact & { company: Pick<Company, "id" | "nome"> | null };

function ContactsList() {
  const [q, setQ] = useState("");
  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["contacts-with-company"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("*, company:companies(id, nome)")
        .order("primeiro_nome");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const filtered = contacts.filter((c) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return (
      contactFullName(c).toLowerCase().includes(needle) ||
      (c.email ?? "").toLowerCase().includes(needle) ||
      (c.posicao ?? "").toLowerCase().includes(needle) ||
      (c.company?.nome ?? "").toLowerCase().includes(needle)
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
            placeholder="Procurar contactos…"
            className="pl-8"
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {filtered.length} de {contacts.length}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Posição</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Telemóvel</TableHead>
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
                      <Users className="h-6 w-6 opacity-50" />
                      Nenhum contacto. Use o botão “Novo” no topo.
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{contactFullName(c)}</TableCell>
                  <TableCell className="text-muted-foreground">{c.company?.nome ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.posicao ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.email ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.telemovel ?? c.telefone ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
