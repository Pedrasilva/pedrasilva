/**
 * Suppliers master-data section.
 *
 * Source of truth: `companies` with `is_supplier = true`.
 * Same record as CRM/clients — never duplicated. Powers supplier pickers
 * in bank reconciliation, document editor, and project expenses.
 */

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus, Search, Loader2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CounterpartyEditor } from "./clients-master-data";

type Supplier = {
  id: string;
  name: string;
  nif: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  also_client: boolean;
};

export function SuppliersMasterData() {
  const { t } = useTranslation(["finance", "common"]);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["finance", "suppliers-master"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, nome, nif, email, telefone, morada, notas, is_active, is_client")
        .eq("is_supplier", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        name: r.nome,
        nif: r.nif,
        email: r.email,
        phone: r.telefone,
        address: r.morada,
        notes: r.notas,
        is_active: r.is_active,
        also_client: r.is_client,
      })) as Supplier[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.nif ?? "").toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ["finance", "suppliers-master"] });
    await qc.invalidateQueries({ queryKey: ["fin-suppliers"] });
    await qc.invalidateQueries({ queryKey: ["finance", "suppliers"] });
  };

  // Map supplier shape → editor's Company-like shape (name/nome, phone/telefone, etc.)
  const editorRecord = editing
    ? {
        id: editing.id,
        nome: editing.name,
        nif: editing.nif,
        email: editing.email,
        telefone: editing.phone,
        morada: editing.address,
        notas: editing.notes,
        is_client: editing.also_client,
        is_supplier: true,
        is_active: editing.is_active,
      }
    : undefined;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{t("finance:suppliersMaster.title")}</CardTitle>
          <CardDescription>{t("finance:suppliersMaster.subtitle")}</CardDescription>
        </div>
        <Button onClick={() => setCreating(true)} size="sm">
          <Plus className="size-4 mr-1" /> {t("finance:suppliersMaster.new")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("finance:suppliersMaster.searchPlaceholder")}
            className="pl-8"
          />
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            <Loader2 className="size-4 inline mr-1 animate-spin" />
            {t("common:loading")}
          </div>
        ) : (
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("finance:suppliersMaster.name")}</TableHead>
                  <TableHead>{t("finance:suppliersMaster.nif")}</TableHead>
                  <TableHead>{t("finance:suppliersMaster.email")}</TableHead>
                  <TableHead>{t("finance:suppliersMaster.phone")}</TableHead>
                  <TableHead>{t("finance:suppliersMaster.status")}</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      {t("finance:suppliersMaster.empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.nif ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.email ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.phone ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {r.is_active ? (
                            <Badge variant="secondary">{t("finance:suppliersMaster.active")}</Badge>
                          ) : (
                            <Badge variant="outline">{t("finance:suppliersMaster.inactive")}</Badge>
                          )}
                          {r.also_client ? (
                            <Badge variant="outline">{t("finance:suppliersMaster.alsoClient")}</Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => setEditing(r)}>
                          <Pencil className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <CounterpartyEditor
        open={creating}
        onOpenChange={setCreating}
        kind="supplier"
        onSaved={invalidate}
      />
      <CounterpartyEditor
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        kind="supplier"
        record={editorRecord}
        onSaved={invalidate}
      />
    </Card>
  );
}
