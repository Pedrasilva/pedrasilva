/**
 * Financial Classifications admin screen.
 *
 * Reuses the canonical `public.financial_classifications` table.
 * Admins can create / edit / (de)activate classifications.
 * Non-admins see a read-only table (DB RLS also enforces).
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Plus, Pencil } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Level = "category" | "group" | "subgroup";
type Nature =
  | "operational"
  | "project_cost"
  | "payroll"
  | "tax"
  | "financing"
  | "transfer"
  | "income";
type Policy = "mandatory" | "discretionary" | "pass_through";

const LEVELS: Level[] = ["category", "group", "subgroup"];
const NATURES: Nature[] = [
  "operational",
  "project_cost",
  "payroll",
  "tax",
  "financing",
  "transfer",
  "income",
];
const POLICIES: Policy[] = ["mandatory", "discretionary", "pass_through"];

type Row = {
  id: string;
  code: string;
  name_pt: string;
  name_en: string;
  parent_id: string | null;
  level: Level;
  financial_nature: Nature;
  spending_policy: Policy;
  affects_profit: boolean;
  affects_cash_flow: boolean;
  project_link_allowed: boolean;
  supplier_required: boolean;
  collaborator_link_allowed: boolean;
  reimbursable_default: boolean;
  active: boolean;
  sort_order: number;
  notes: string | null;
};

type FormState = Omit<Row, "id">;

function emptyForm(): FormState {
  return {
    code: "",
    name_pt: "",
    name_en: "",
    parent_id: null,
    level: "subgroup",
    financial_nature: "operational",
    spending_policy: "discretionary",
    affects_profit: true,
    affects_cash_flow: true,
    project_link_allowed: false,
    supplier_required: false,
    collaborator_link_allowed: false,
    reimbursable_default: false,
    active: true,
    sort_order: 0,
    notes: "",
  };
}

export function FinancialClassificationsAdmin() {
  const { t, i18n } = useTranslation("finance");
  const isPt = i18n.language?.startsWith("pt");
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [natureFilter, setNatureFilter] = useState<Nature | "all">("all");
  const [policyFilter, setPolicyFilter] = useState<Policy | "all">("all");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("active");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  const dataQ = useQuery({
    queryKey: ["finance", "classifications", "admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_classifications")
        .select(
          "id, code, name_pt, name_en, parent_id, level, financial_nature, spending_policy, affects_profit, affects_cash_flow, project_link_allowed, supplier_required, collaborator_link_allowed, reimbursable_default, active, sort_order, notes",
        )
        .order("code");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const rows = dataQ.data ?? [];
  const parentOptions = useMemo(
    () => rows.filter((r) => r.level !== "subgroup"),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (activeFilter === "active" && !r.active) return false;
      if (activeFilter === "inactive" && r.active) return false;
      if (natureFilter !== "all" && r.financial_nature !== natureFilter) return false;
      if (policyFilter !== "all" && r.spending_policy !== policyFilter) return false;
      if (!needle) return true;
      return (
        r.code.toLowerCase().includes(needle) ||
        r.name_pt.toLowerCase().includes(needle) ||
        r.name_en.toLowerCase().includes(needle)
      );
    });
  }, [rows, q, natureFilter, policyFilter, activeFilter]);

  const upsert = useMutation({
    mutationFn: async ({ id, payload }: { id: string | null; payload: FormState }) => {
      const clean = {
        ...payload,
        notes: payload.notes?.trim() ? payload.notes.trim() : null,
        parent_id: payload.parent_id || null,
      };
      if (id) {
        const { error } = await supabase
          .from("financial_classifications")
          .update(clean)
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("financial_classifications")
          .insert(clean);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(t("financialClassifications.saved"));
      qc.invalidateQueries({ queryKey: ["finance", "classifications"] });
      setEditorOpen(false);
      setEditingId(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const toggleActive = useMutation({
    mutationFn: async (row: Row) => {
      const { error } = await supabase
        .from("financial_classifications")
        .update({ active: !row.active })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["finance", "classifications"] }),
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setEditorOpen(true);
  }

  function openEdit(r: Row) {
    setEditingId(r.id);
    setForm({
      code: r.code,
      name_pt: r.name_pt,
      name_en: r.name_en,
      parent_id: r.parent_id,
      level: r.level,
      financial_nature: r.financial_nature,
      spending_policy: r.spending_policy,
      affects_profit: r.affects_profit,
      affects_cash_flow: r.affects_cash_flow,
      project_link_allowed: r.project_link_allowed,
      supplier_required: r.supplier_required,
      collaborator_link_allowed: r.collaborator_link_allowed,
      reimbursable_default: r.reimbursable_default,
      active: r.active,
      sort_order: r.sort_order,
      notes: r.notes ?? "",
    });
    setEditorOpen(true);
  }

  function submit() {
    if (!form.code.trim() || !form.name_pt.trim() || !form.name_en.trim()) {
      toast.error(t("financialClassifications.requiredFields"));
      return;
    }
    upsert.mutate({ id: editingId, payload: form });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{t("financialClassifications.title")}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("financialClassifications.subtitle")}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            {t("financialClassifications.new")}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("financialClassifications.searchPlaceholder")}
              className="pl-8"
            />
          </div>
          <Select value={natureFilter} onValueChange={(v) => setNatureFilter(v as any)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t("financialClassifications.nature")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("financialClassifications.allNatures")}</SelectItem>
              {NATURES.map((n) => (
                <SelectItem key={n} value={n}>
                  {t(`financialClassifications.natures.${n}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={policyFilter} onValueChange={(v) => setPolicyFilter(v as any)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t("financialClassifications.policy")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("financialClassifications.allPolicies")}</SelectItem>
              {POLICIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {t(`financialClassifications.policies.${p}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={activeFilter} onValueChange={(v) => setActiveFilter(v as any)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">{t("financialClassifications.activeOnly")}</SelectItem>
              <SelectItem value="inactive">{t("financialClassifications.inactiveOnly")}</SelectItem>
              <SelectItem value="all">{t("financialClassifications.allStatus")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="max-h-[560px] overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead className="w-[120px]">{t("financialClassifications.code")}</TableHead>
                <TableHead>{t("financialClassifications.name")}</TableHead>
                <TableHead className="w-[110px]">{t("financialClassifications.level")}</TableHead>
                <TableHead className="w-[140px]">{t("financialClassifications.nature")}</TableHead>
                <TableHead className="w-[130px]">{t("financialClassifications.policy")}</TableHead>
                <TableHead className="w-[90px]">{t("financialClassifications.status")}</TableHead>
                <TableHead className="w-[110px] text-right">{t("financialClassifications.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dataQ.isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                    {t("financialClassifications.loading")}
                  </TableCell>
                </TableRow>
              )}
              {!dataQ.isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                    {t("financialClassifications.empty")}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((r) => (
                <TableRow key={r.id} className={r.active ? "" : "opacity-60"}>
                  <TableCell className="font-mono text-xs font-semibold">{r.code}</TableCell>
                  <TableCell>
                    <div className="text-sm">{isPt ? r.name_pt : r.name_en}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {isPt ? r.name_en : r.name_pt}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs capitalize">{r.level}</TableCell>
                  <TableCell className="text-xs">
                    {t(`financialClassifications.natures.${r.financial_nature}`)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[11px]">
                      {t(`financialClassifications.policies.${r.spending_policy}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.active ? "default" : "secondary"} className="text-[10px]">
                      {r.active
                        ? t("financialClassifications.active")
                        : t("financialClassifications.inactive")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {isAdmin && (
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEdit(r)}
                          aria-label={t("financialClassifications.edit")}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleActive.mutate(r)}
                          disabled={toggleActive.isPending}
                        >
                          {r.active
                            ? t("financialClassifications.deactivate")
                            : t("financialClassifications.reactivate")}
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId
                ? t("financialClassifications.editTitle")
                : t("financialClassifications.newTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("financialClassifications.editorSubtitle")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("financialClassifications.code")}</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </div>
              <div>
                <Label>{t("financialClassifications.sortOrder")}</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) =>
                    setForm({ ...form, sort_order: Number(e.target.value) || 0 })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("financialClassifications.namePt")}</Label>
                <Input
                  value={form.name_pt}
                  onChange={(e) => setForm({ ...form, name_pt: e.target.value })}
                />
              </div>
              <div>
                <Label>{t("financialClassifications.nameEn")}</Label>
                <Input
                  value={form.name_en}
                  onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>{t("financialClassifications.level")}</Label>
                <Select
                  value={form.level}
                  onValueChange={(v) => setForm({ ...form, level: v as Level })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((l) => (
                      <SelectItem key={l} value={l} className="capitalize">
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("financialClassifications.nature")}</Label>
                <Select
                  value={form.financial_nature}
                  onValueChange={(v) =>
                    setForm({ ...form, financial_nature: v as Nature })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NATURES.map((n) => (
                      <SelectItem key={n} value={n}>
                        {t(`financialClassifications.natures.${n}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("financialClassifications.policy")}</Label>
                <Select
                  value={form.spending_policy}
                  onValueChange={(v) =>
                    setForm({ ...form, spending_policy: v as Policy })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {POLICIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {t(`financialClassifications.policies.${p}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>{t("financialClassifications.parent")}</Label>
              <Select
                value={form.parent_id ?? "__none"}
                onValueChange={(v) =>
                  setForm({ ...form, parent_id: v === "__none" ? null : v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">
                    {t("financialClassifications.noParent")}
                  </SelectItem>
                  {parentOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.code} — {isPt ? p.name_pt : p.name_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-md border p-3">
              {(
                [
                  "affects_profit",
                  "affects_cash_flow",
                  "project_link_allowed",
                  "supplier_required",
                  "collaborator_link_allowed",
                  "reimbursable_default",
                  "active",
                ] as const
              ).map((key) => (
                <div key={key} className="flex items-center justify-between gap-2">
                  <Label className="text-xs">
                    {t(`financialClassifications.flags.${key}`)}
                  </Label>
                  <Switch
                    checked={Boolean(form[key])}
                    onCheckedChange={(v) => setForm({ ...form, [key]: v })}
                  />
                </div>
              ))}
            </div>

            <div>
              <Label>{t("financialClassifications.notes")}</Label>
              <Textarea
                value={form.notes ?? ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              {t("financialClassifications.cancel")}
            </Button>
            <Button onClick={submit} disabled={upsert.isPending || !isAdmin}>
              {t("financialClassifications.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
