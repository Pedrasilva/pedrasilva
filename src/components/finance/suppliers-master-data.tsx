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
import { CounterpartyEditor, type CompanyRow } from "./clients-master-data";
import { CompaniesImportCard } from "./companies-import-card";

const SELECT_COLS =
  "id, nome, nif, code, abbreviation, email, telefone, mobile, morada, postal_code, city, currency, payment_terms, notas, is_client, is_supplier, is_active";

export function SuppliersMasterData() {
  const { t } = useTranslation(["finance", "common"]);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CompanyRow | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["finance", "suppliers-master"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select(SELECT_COLS)
        .eq("is_supplier", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as CompanyRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.nome.toLowerCase().includes(q) ||
        (r.nif ?? "").toLowerCase().includes(q) ||
        (r.code ?? "").toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ["finance", "suppliers-master"] });
    await qc.invalidateQueries({ queryKey: ["finance", "clients-master"] });
    await qc.invalidateQueries({ queryKey: ["fin-suppliers"] });
    await qc.invalidateQueries({ queryKey: ["finance", "suppliers"] });
    await qc.invalidateQueries({ queryKey: ["companies"] });
  };

  return (
    <div className="space-y-6">
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
                  <TableHead className="w-20">{t("finance:suppliersMaster.code")}</TableHead>
                  <TableHead>{t("finance:suppliersMaster.name")}</TableHead>
                  <TableHead>{t("finance:suppliersMaster.nif")}</TableHead>
                  <TableHead>{t("finance:suppliersMaster.email")}</TableHead>
                  <TableHead>{t("finance:suppliersMaster.phone")}</TableHead>
                  <TableHead className="w-20">{t("finance:suppliersMaster.currency")}</TableHead>
                  <TableHead>{t("finance:suppliersMaster.status")}</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      {t("finance:suppliersMaster.empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {r.code ?? "—"}
                      </TableCell>
                      <TableCell className="font-medium">{r.nome}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.nif ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.email ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.telefone ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.currency}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {r.is_active ? (
                            <Badge variant="secondary">{t("finance:suppliersMaster.active")}</Badge>
                          ) : (
                            <Badge variant="outline">{t("finance:suppliersMaster.inactive")}</Badge>
                          )}
                          {r.is_client ? (
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
        record={editing ?? undefined}
        onSaved={invalidate}
      />
    </Card>
  );
}
