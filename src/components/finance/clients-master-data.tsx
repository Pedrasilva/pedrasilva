/**
 * Clients master-data section.
 *
 * Source of truth: `companies` with `is_client = true`.
 * Same record powers CRM, Projects billing, and Finance documents — never
 * duplicated. Toggle `is_client` here to surface a CRM company as a finance
 * client without copying.
 */

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Search, Loader2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { upsertCompany } from "@/lib/finance/companies.functions";
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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CompaniesImportCard } from "./companies-import-card";

export type CompanyRow = {
  id: string;
  nome: string;
  nif: string | null;
  code: string | null;
  abbreviation: string | null;
  email: string | null;
  telefone: string | null;
  mobile: string | null;
  morada: string | null;
  postal_code: string | null;
  city: string | null;
  currency: string;
  payment_terms: string | null;
  notas: string | null;
  is_client: boolean;
  is_supplier: boolean;
  is_active: boolean;
};

const SELECT_COLS =
  "id, nome, nif, code, abbreviation, email, telefone, mobile, morada, postal_code, city, currency, payment_terms, notas, is_client, is_supplier, is_active";

const CURRENCIES = ["EUR", "USD", "GBP", "BRL", "CHF"];

export function ClientsMasterData() {
  const { t } = useTranslation(["finance", "common"]);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CompanyRow | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["finance", "clients-master"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select(SELECT_COLS)
        .eq("is_client", true)
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
    await qc.invalidateQueries({ queryKey: ["finance", "clients-master"] });
    await qc.invalidateQueries({ queryKey: ["finance", "suppliers-master"] });
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
                  <TableHead className="w-20">{t("finance:clientsMaster.code")}</TableHead>
                  <TableHead>{t("finance:clientsMaster.name")}</TableHead>
                  <TableHead>{t("finance:clientsMaster.nif")}</TableHead>
                  <TableHead>{t("finance:clientsMaster.email")}</TableHead>
                  <TableHead>{t("finance:clientsMaster.phone")}</TableHead>
                  <TableHead className="w-20">{t("finance:clientsMaster.currency")}</TableHead>
                  <TableHead>{t("finance:clientsMaster.status")}</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      {t("finance:clientsMaster.empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {r.code ?? "—"}
                      </TableCell>
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
                      <TableCell className="text-xs text-muted-foreground">{r.currency}</TableCell>
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
  record?: CompanyRow;
  onSaved: () => void | Promise<void>;
};

export function CounterpartyEditor({ open, onOpenChange, kind, record, onSaved }: EditorProps) {
  const { t } = useTranslation(["finance", "common"]);
  const isEdit = !!record;
  const upsert = useServerFn(upsertCompany);

  const [nome, setNome] = useState("");
  const [code, setCode] = useState("");
  const [abbreviation, setAbbreviation] = useState("");
  const [nif, setNif] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [mobile, setMobile] = useState("");
  const [morada, setMorada] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [notas, setNotas] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [alsoOther, setAlsoOther] = useState(false);

  // Sync when record changes (re-opening for a different row, or create vs edit)
  useEffect(() => {
    if (record) {
      setNome(record.nome ?? "");
      setCode(record.code ?? "");
      setAbbreviation(record.abbreviation ?? "");
      setNif(record.nif ?? "");
      setEmail(record.email ?? "");
      setTelefone(record.telefone ?? "");
      setMobile(record.mobile ?? "");
      setMorada(record.morada ?? "");
      setPostalCode(record.postal_code ?? "");
      setCity(record.city ?? "");
      setCurrency(record.currency || "EUR");
      setPaymentTerms(record.payment_terms ?? "");
      setNotas(record.notas ?? "");
      setIsActive(record.is_active);
      setAlsoOther(kind === "client" ? record.is_supplier : record.is_client);
    } else {
      setNome("");
      setCode("");
      setAbbreviation("");
      setNif("");
      setEmail("");
      setTelefone("");
      setMobile("");
      setMorada("");
      setPostalCode("");
      setCity("");
      setCurrency("EUR");
      setPaymentTerms("");
      setNotas("");
      setIsActive(true);
      setAlsoOther(false);
    }
  }, [record, kind, open]);

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = nome.trim();
      if (!trimmed) throw new Error(t("finance:inlineCounterparty.nameRequired"));

      const is_client = kind === "client" ? true : alsoOther;
      const is_supplier = kind === "supplier" ? true : alsoOther;

      await upsert({
        data: {
          id: record?.id,
          nome: trimmed,
          code: code.trim() || null,
          abbreviation: abbreviation.trim() || null,
          nif: nif.trim() || null,
          email: email.trim() || null,
          telefone: telefone.trim() || null,
          mobile: mobile.trim() || null,
          morada: morada.trim() || null,
          postal_code: postalCode.trim() || null,
          city: city.trim() || null,
          currency: currency.trim().toUpperCase() || "EUR",
          payment_terms: paymentTerms.trim() || null,
          notas: notas.trim() || null,
          is_client,
          is_supplier,
          is_active: isActive,
        },
      });
    },
    onSuccess: async () => {
      toast.success(isEdit ? t("common:saved") : t("finance:inlineCounterparty.clientCreated"));
      await onSaved();
      onOpenChange(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
  });

  const title = isEdit
    ? kind === "client"
      ? t("finance:clientsMaster.edit")
      : t("finance:suppliersMaster.edit")
    : kind === "client"
      ? t("finance:clientsMaster.new")
      : t("finance:suppliersMaster.new");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-1 md:grid-cols-[120px_1fr_120px] gap-2">
            <div className="space-y-1">
              <Label className="text-xs">{t("finance:clientsMaster.code")}</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t("finance:clientsMaster.codeAuto")}
                className="font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("finance:clientsMaster.name")} *</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("finance:clientsMaster.abbreviation")}</Label>
              <Input value={abbreviation} onChange={(e) => setAbbreviation(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">{t("finance:clientsMaster.nif")}</Label>
              <Input value={nif} onChange={(e) => setNif(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("finance:clientsMaster.currency")}</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">{t("finance:clientsMaster.email")}</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">{t("finance:clientsMaster.phone")}</Label>
              <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("finance:clientsMaster.mobile")}</Label>
              <Input value={mobile} onChange={(e) => setMobile(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">{t("finance:clientsMaster.address")}</Label>
            <Textarea rows={2} value={morada} onChange={(e) => setMorada(e.target.value)} />
          </div>

          <div className="grid grid-cols-[120px_1fr] gap-2">
            <div className="space-y-1">
              <Label className="text-xs">{t("finance:clientsMaster.postalCode")}</Label>
              <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("finance:clientsMaster.city")}</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">{t("finance:clientsMaster.paymentTerms")}</Label>
            <Input
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              placeholder={t("finance:clientsMaster.paymentTermsPlaceholder")}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">{t("finance:clientsMaster.notes")}</Label>
            <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-2">
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} id="is-active" />
              <Label htmlFor="is-active" className="text-sm">
                {t("finance:clientsMaster.active")}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={alsoOther}
                onCheckedChange={setAlsoOther}
                id="also-other"
              />
              <Label htmlFor="also-other" className="text-sm">
                {kind === "client"
                  ? t("finance:clientsMaster.alsoSupplier")
                  : t("finance:suppliersMaster.alsoClient")}
              </Label>
            </div>
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
