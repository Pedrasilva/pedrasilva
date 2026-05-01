/**
 * Clients master-data section.
 *
 * Source of truth: `companies` with `is_client = true`.
 * Same record powers CRM, Projects billing, and Finance documents — never
 * duplicated. Toggle `is_client` here to surface a CRM company as a finance
 * client without copying.
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Search, Loader2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Company = {
  id: string;
  nome: string;
  nif: string | null;
  email: string | null;
  telefone: string | null;
  morada: string | null;
  notas: string | null;
  is_client: boolean;
  is_supplier: boolean;
  is_active: boolean;
};

export function ClientsMasterData() {
  const { t } = useTranslation(["finance", "common"]);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Company | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["finance", "clients-master"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, nome, nif, email, telefone, morada, notas, is_client, is_supplier, is_active")
        .eq("is_client", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Company[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.nome.toLowerCase().includes(q) ||
        (r.nif ?? "").toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ["finance", "clients-master"] });
    await qc.invalidateQueries({ queryKey: ["fin-clients"] });
    await qc.invalidateQueries({ queryKey: ["finance", "clients-map"] });
    await qc.invalidateQueries({ queryKey: ["companies"] });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{t("finance:clientsMaster.title")}</CardTitle>
          <CardDescription>{t("finance:clientsMaster.subtitle")}</CardDescription>
        </div>
        <Button onClick={() => setCreating(true)} size="sm">
          <Plus className="size-4 mr-1" /> {t("finance:clientsMaster.new")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("finance:clientsMaster.searchPlaceholder")}
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
                  <TableHead>{t("finance:clientsMaster.name")}</TableHead>
                  <TableHead>{t("finance:clientsMaster.nif")}</TableHead>
                  <TableHead>{t("finance:clientsMaster.email")}</TableHead>
                  <TableHead>{t("finance:clientsMaster.phone")}</TableHead>
                  <TableHead>{t("finance:clientsMaster.status")}</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      {t("finance:clientsMaster.empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.nome}
                        {r.is_supplier ? (
                          <Badge variant="outline" className="ml-2 text-xs">
                            {t("finance:clientsMaster.alsoSupplier")}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.nif ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.email ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.telefone ?? "—"}</TableCell>
                      <TableCell>
                        {r.is_active ? (
                          <Badge variant="secondary">{t("finance:clientsMaster.active")}</Badge>
                        ) : (
                          <Badge variant="outline">{t("finance:clientsMaster.inactive")}</Badge>
                        )}
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
        kind="client"
        onSaved={invalidate}
      />
      <CounterpartyEditor
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        kind="client"
        record={editing ?? undefined}
        onSaved={invalidate}
      />
    </Card>
  );
}

/* ---------------- Editor (shared between create + edit) ---------------- */

type EditorProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: "client" | "supplier";
  record?: Company;
  onSaved: () => void | Promise<void>;
};

export function CounterpartyEditor({ open, onOpenChange, kind, record, onSaved }: EditorProps) {
  const { t } = useTranslation(["finance", "common"]);
  const isEdit = !!record;
  const [nome, setNome] = useState(record?.nome ?? "");
  const [nif, setNif] = useState(record?.nif ?? "");
  const [email, setEmail] = useState(record?.email ?? "");
  const [telefone, setTelefone] = useState(record?.telefone ?? "");
  const [morada, setMorada] = useState(record?.morada ?? "");
  const [notas, setNotas] = useState(record?.notas ?? "");
  const [isActive, setIsActive] = useState(record?.is_active ?? true);

  // sync when record changes (re-opening for a different row)
  useMemo(() => {
    if (record) {
      setNome(record.nome);
      setNif(record.nif ?? "");
      setEmail(record.email ?? "");
      setTelefone(record.telefone ?? "");
      setMorada(record.morada ?? "");
      setNotas(record.notas ?? "");
      setIsActive(record.is_active);
    } else {
      setNome("");
      setNif("");
      setEmail("");
      setTelefone("");
      setMorada("");
      setNotas("");
      setIsActive(true);
    }
  }, [record]);

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = nome.trim();
      if (!trimmed) throw new Error(t("finance:inlineCounterparty.nameRequired"));

      if (kind === "client") {
        const payload = {
          nome: trimmed,
          nif: nif.trim() || null,
          email: email.trim() || null,
          telefone: telefone.trim() || null,
          morada: morada.trim() || null,
          notas: notas.trim() || null,
          is_active: isActive,
        };
        if (isEdit && record) {
          const { error } = await supabase.from("companies").update(payload).eq("id", record.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("companies")
            .insert({ ...payload, is_client: true });
          if (error) throw error;
        }
      } else {
        // Suppliers live in companies (unified) with is_supplier=true.
        const payload = {
          nome: trimmed,
          nif: nif.trim() || null,
          email: email.trim() || null,
          telefone: telefone.trim() || null,
          morada: morada.trim() || null,
          notas: notas.trim() || null,
          is_active: isActive,
        };
        if (isEdit && record) {
          const { error } = await supabase
            .from("companies")
            .update(payload)
            .eq("id", record.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("companies")
            .insert({ ...payload, is_supplier: true });
          if (error) throw error;
        }
      }
    },
    onSuccess: async () => {
      toast.success(isEdit ? t("common:saved") : t("finance:inlineCounterparty.clientCreated"));
      await onSaved();
      onOpenChange(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? kind === "client"
                ? t("finance:clientsMaster.edit")
                : t("finance:suppliersMaster.edit")
              : kind === "client"
                ? t("finance:clientsMaster.new")
                : t("finance:suppliersMaster.new")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">{t("finance:clientsMaster.name")} *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">{t("finance:clientsMaster.nif")}</Label>
              <Input value={nif} onChange={(e) => setNif(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("finance:clientsMaster.phone")}</Label>
              <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("finance:clientsMaster.email")}</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("finance:clientsMaster.address")}</Label>
            <Textarea rows={2} value={morada} onChange={(e) => setMorada(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("finance:clientsMaster.notes")}</Label>
            <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 pt-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} id="is-active" />
            <Label htmlFor="is-active" className="text-sm">
              {t("finance:clientsMaster.active")}
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common:cancel")}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : null}
            {t("common:save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
