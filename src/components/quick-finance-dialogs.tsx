/**
 * Global "Create" workflow for finance records.
 *
 * Implements the ownership rule (project-owned vs company-owned) declared in
 * `src/lib/finance/ownership.ts`:
 *   - When the user is inside a project route, the current `projectId` is
 *     auto-detected and the picker is hidden.
 *   - When the user is outside a project, a project picker is required —
 *     UNLESS they toggle "This is a company expense" (expenses only), in
 *     which case the record is written to `company_expenses` with no
 *     `project_id`.
 *
 * Forms intentionally minimal — full editing lives inside project tabs.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Building2, Briefcase, Package, Receipt } from "lucide-react";
import { useProjects } from "@/lib/projects/use-planner";
import {
  EXPENSE_CATEGORIES,
  useUpsertProjectExpense,
  type ExpenseCategory,
} from "@/lib/projects/use-project-expenses";
import { useUpsertExternalService } from "@/lib/projects/use-external-services";
import { useUpsertCompanyExpense } from "@/lib/finance/use-company-expenses";
import { SupplierPicker } from "@/components/projects/supplier-picker";
import type { Supplier } from "@/lib/projects/use-suppliers";

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

/**
 * Reads the active project id from the URL when the user is on a project
 * detail route (`/projects/$projectId/...`). Returns `null` when the user is
 * elsewhere — the dialog will then require a manual selection.
 */
function useCurrentProjectId(): string | null {
  const params = useRouterState({
    select: (s) =>
      (s.matches.find((m) => "projectId" in (m.params ?? {}))?.params as
        | { projectId?: string }
        | undefined)?.projectId ?? null,
  });
  return params;
}

interface ProjectPickerProps {
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  placeholder: string;
}

function ProjectPicker({ value, onChange, disabled, placeholder }: ProjectPickerProps) {
  const { data: projects = [] } = useProjects();
  const active = useMemo(
    () => projects.filter((p) => p.status !== "archived"),
    [projects],
  );
  return (
    <Select
      value={value ?? ""}
      onValueChange={(v) => onChange(v || null)}
      disabled={disabled}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {active.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
            {p.client ? ` · ${p.client}` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Quick Expense (project OR company)
// ──────────────────────────────────────────────────────────────────────────

interface QuickExpenseProps {
  open: boolean;
  onClose: () => void;
}

export function QuickExpenseDialog({ open, onClose }: QuickExpenseProps) {
  const { t } = useTranslation("projects");
  const today = new Date().toISOString().slice(0, 10);
  const currentProjectId = useCurrentProjectId();

  const [projectId, setProjectId] = useState<string | null>(currentProjectId);
  const [isCompanyExpense, setIsCompanyExpense] = useState(false);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("misc");
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [incurredAt, setIncurredAt] = useState(today);
  const [notes, setNotes] = useState("");

  // Re-sync when reopened (route may have changed in between).
  useEffect(() => {
    if (open) {
      setProjectId(currentProjectId);
      setIsCompanyExpense(false);
      setDescription("");
      setCategory("misc");
      setSupplierId(null);
      setVendor("");
      setAmount("");
      setIncurredAt(today);
      setNotes("");
    }
    // `today` is stable per render-day; safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentProjectId]);

  const upsertProject = useUpsertProjectExpense(projectId ?? "");
  const upsertCompany = useUpsertCompanyExpense();
  const isPending = upsertProject.isPending || upsertCompany.isPending;

  function handleSupplier(id: string | null, supplier: Supplier | null) {
    setSupplierId(id);
    if (supplier) setVendor(supplier.name);
    else if (id === null) setVendor("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) {
      toast.error(t("quickFinance.errors.descriptionRequired"));
      return;
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error(t("quickFinance.errors.amountRequired"));
      return;
    }
    if (!isCompanyExpense && !projectId) {
      toast.error(t("quickFinance.errors.projectRequired"));
      return;
    }
    try {
      if (isCompanyExpense) {
        await upsertCompany.mutateAsync({
          description: description.trim(),
          category,
          supplier_id: supplierId,
          vendor: vendor.trim() || null,
          amount: amt,
          incurred_at: incurredAt || null,
          paid_at: null,
          status: "draft",
          notes: notes.trim() || null,
        });
        toast.success(t("quickFinance.toasts.companyExpenseCreated"));
      } else {
        await upsertProject.mutateAsync({
          description: description.trim(),
          category,
          supplier_id: supplierId,
          vendor: vendor.trim() || null,
          purchase_price: amt,
          sale_price: 0,
          incurred_at: incurredAt || null,
          expense_date: incurredAt || null,
          status: "draft",
          paid_at: null,
          rebillable: false,
          notes: notes.trim() || null,
        } as never);
        toast.success(t("quickFinance.toasts.projectExpenseCreated"));
      }
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" /> {t("quickFinance.expense.title")}
          </DialogTitle>
          <DialogDescription>
            {t("quickFinance.expense.description")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {/* Ownership: project picker + company toggle */}
          <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
            {!currentProjectId && (
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor="qf-company" className="cursor-pointer flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" />
                    {t("quickFinance.fields.companyExpense")}
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    {t("quickFinance.fields.companyExpenseHint")}
                  </p>
                </div>
                <Switch
                  id="qf-company"
                  checked={isCompanyExpense}
                  onCheckedChange={setIsCompanyExpense}
                />
              </div>
            )}
            {!isCompanyExpense && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs">
                  <Briefcase className="h-3.5 w-3.5" />
                  {t("quickFinance.fields.project")}
                  {currentProjectId && (
                    <span className="text-[10px] uppercase tracking-wider text-primary">
                      {t("quickFinance.fields.autoDetected")}
                    </span>
                  )}
                </Label>
                {currentProjectId ? (
                  <ProjectPicker
                    value={projectId}
                    onChange={setProjectId}
                    placeholder={t("quickFinance.fields.projectPlaceholder")}
                    disabled
                  />
                ) : (
                  <ProjectPicker
                    value={projectId}
                    onChange={setProjectId}
                    placeholder={t("quickFinance.fields.projectPlaceholder")}
                    disabled={isPending}
                  />
                )}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="qf-desc">{t("quickFinance.fields.description")}</Label>
              <Input
                id="qf-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("quickFinance.fields.descriptionPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qf-cat">{t("quickFinance.fields.category")}</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
                <SelectTrigger id="qf-cat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(`expenses.category.${c}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qf-amt">{t("quickFinance.fields.amount")} (€)</Label>
              <Input
                id="qf-amt"
                type="number"
                step="0.01"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("quickFinance.fields.supplier")}</Label>
              <SupplierPicker
                value={supplierId}
                legacyName={vendor}
                onChange={handleSupplier}
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qf-date">{t("quickFinance.fields.incurredAt")}</Label>
              <Input
                id="qf-date"
                type="date"
                value={incurredAt}
                onChange={(e) => setIncurredAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="qf-notes">{t("quickFinance.fields.notes")}</Label>
              <Textarea
                id="qf-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("quickFinance.actions.cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {t("quickFinance.actions.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Quick Material (External service) — always project-owned
// ──────────────────────────────────────────────────────────────────────────

interface QuickMaterialProps {
  open: boolean;
  onClose: () => void;
}

export function QuickMaterialDialog({ open, onClose }: QuickMaterialProps) {
  const { t } = useTranslation("projects");
  const currentProjectId = useCurrentProjectId();

  const [projectId, setProjectId] = useState<string | null>(currentProjectId);
  const [description, setDescription] = useState("");
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [quantity, setQuantity] = useState<string>("1");
  const [unitCost, setUnitCost] = useState<string>("");
  const [markupValue, setMarkupValue] = useState<string>("0");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setProjectId(currentProjectId);
      setDescription("");
      setSupplierId(null);
      setSupplierName("");
      setQuantity("1");
      setUnitCost("");
      setMarkupValue("0");
      setNotes("");
    }
  }, [open, currentProjectId]);

  const upsert = useUpsertExternalService(projectId ?? "");

  function handleSupplier(id: string | null, supplier: Supplier | null) {
    setSupplierId(id);
    if (supplier) setSupplierName(supplier.name);
    else if (id === null) setSupplierName("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) {
      toast.error(t("quickFinance.errors.projectRequired"));
      return;
    }
    if (!description.trim()) {
      toast.error(t("quickFinance.errors.descriptionRequired"));
      return;
    }
    const qty = Number(quantity) || 1;
    const cost = Number(unitCost) || 0;
    if (cost <= 0) {
      toast.error(t("quickFinance.errors.unitCostRequired"));
      return;
    }
    try {
      await upsert.mutateAsync({
        description: description.trim(),
        supplier_id: supplierId,
        supplier_name: supplierName.trim() || null,
        quantity: qty,
        unit_cost: cost,
        purchase_price: cost,
        markup_type: "percent",
        markup_value: Number(markupValue) || 0,
        sale_price_manual: false,
        sale_price: 0,
        status: "draft",
        notes: notes.trim() || null,
      } as never);
      toast.success(t("quickFinance.toasts.materialCreated"));
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" /> {t("quickFinance.material.title")}
          </DialogTitle>
          <DialogDescription>{t("quickFinance.material.description")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5 rounded-md border border-border bg-muted/30 p-3">
            <Label className="flex items-center gap-1.5 text-xs">
              <Briefcase className="h-3.5 w-3.5" />
              {t("quickFinance.fields.project")}
              {currentProjectId && (
                <span className="text-[10px] uppercase tracking-wider text-primary">
                  {t("quickFinance.fields.autoDetected")}
                </span>
              )}
            </Label>
            <ProjectPicker
              value={projectId}
              onChange={setProjectId}
              placeholder={t("quickFinance.fields.projectPlaceholder")}
              disabled={!!currentProjectId || upsert.isPending}
            />
            <p className="text-[11px] text-muted-foreground">
              {t("quickFinance.material.projectHint")}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="qm-desc">{t("quickFinance.fields.description")}</Label>
              <Input
                id="qm-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("quickFinance.fields.descriptionPlaceholder")}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("quickFinance.fields.supplier")}</Label>
              <SupplierPicker
                value={supplierId}
                legacyName={supplierName}
                onChange={handleSupplier}
                disabled={upsert.isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qm-qty">{t("quickFinance.fields.quantity")}</Label>
              <Input
                id="qm-qty"
                type="number"
                step="0.01"
                min={0}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qm-cost">{t("quickFinance.fields.unitCost")} (€)</Label>
              <Input
                id="qm-cost"
                type="number"
                step="0.01"
                min={0}
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="qm-markup">{t("quickFinance.fields.markupPercent")} (%)</Label>
              <Input
                id="qm-markup"
                type="number"
                step="0.5"
                value={markupValue}
                onChange={(e) => setMarkupValue(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="qm-notes">{t("quickFinance.fields.notes")}</Label>
              <Textarea
                id="qm-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("quickFinance.actions.cancel")}
            </Button>
            <Button type="submit" disabled={upsert.isPending}>
              {t("quickFinance.actions.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
