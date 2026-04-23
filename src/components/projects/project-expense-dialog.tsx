import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
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
import {
  EXPENSE_CATEGORIES,
  EXPENSE_STATUSES,
  useUpsertProjectExpense,
  type ExpenseCategory,
  type ExpenseStatus,
  type ProjectExpense,
} from "@/lib/projects/use-project-expenses";
import {
  projectExpenseSchema,
  flattenIssues,
} from "@/lib/projects/financial-validation";
import { SupplierPicker } from "./supplier-picker";
import type { Supplier } from "@/lib/projects/use-suppliers";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  initial?: (ProjectExpense & { supplier_id?: string | null }) | null;
}

export function ProjectExpenseDialog({ open, onOpenChange, projectId, initial }: Props) {
  const { t } = useTranslation("projects");
  const upsert = useUpsertProjectExpense(projectId);

  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("misc");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState(0);
  const [incurredAt, setIncurredAt] = useState("");
  const [status, setStatus] = useState<ExpenseStatus>("draft");
  const [paidAt, setPaidAt] = useState("");
  const [rebillable, setRebillable] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setDescription(initial?.description ?? "");
      setCategory((initial?.category ?? "misc") as ExpenseCategory);
      setVendor(initial?.vendor ?? "");
      setAmount(Number(initial?.purchase_price ?? 0));
      setIncurredAt(initial?.incurred_at ?? initial?.expense_date ?? "");
      setStatus((initial?.status ?? "draft") as ExpenseStatus);
      setPaidAt(initial?.paid_at ?? "");
      setRebillable(initial?.rebillable ?? false);
      setNotes(initial?.notes ?? "");
    }
  }, [open, initial]);

  const parseResult = projectExpenseSchema.safeParse({
    description,
    category,
    amount: Number(amount),
    incurred_at: incurredAt,
    paid_at: paidAt,
    status,
    rebillable,
  });
  const errors = flattenIssues(parseResult);
  const isValid = parseResult.success;
  const errMsg = (key: string) =>
    errors[key] ? t(`expenses.dialog.errors.${errors[key]}`) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) {
      toast.error(t("expenses.dialog.errors.formInvalid"));
      return;
    }
    try {
      const payload = {
        description: description.trim(),
        category,
        vendor: vendor.trim() || null,
        purchase_price: Number(amount || 0),
        sale_price: 0, // expenses never carry margin
        incurred_at: incurredAt || null,
        expense_date: incurredAt || null,
        status,
        paid_at: paidAt || null,
        rebillable,
        notes: notes.trim() || null,
        ...(initial?.id ? { id: initial.id } : {}),
      };
      await upsert.mutateAsync(payload as never);
      toast.success(
        initial?.id ? t("expenses.dialog.toast.updated") : t("expenses.dialog.toast.created"),
      );
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {initial?.id ? t("expenses.dialog.editTitle") : t("expenses.dialog.createTitle")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ex-desc">{t("expenses.fields.description")}</Label>
              <Input
                id="ex-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("expenses.fields.descriptionPlaceholder")}
                aria-invalid={!!errMsg("description")}
              />
              {errMsg("description") && (
                <p className="text-[11px] text-destructive">{errMsg("description")}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-cat">{t("expenses.fields.category")}</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
                <SelectTrigger id="ex-cat">
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
              <Label htmlFor="ex-vendor">{t("expenses.fields.vendor")}</Label>
              <Input
                id="ex-vendor"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-amt">{t("expenses.fields.amount")} (€)</Label>
              <Input
                id="ex-amt"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                aria-invalid={!!errMsg("amount")}
              />
              {errMsg("amount") && (
                <p className="text-[11px] text-destructive">{errMsg("amount")}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-incurred">{t("expenses.fields.incurredAt")}</Label>
              <Input
                id="ex-incurred"
                type="date"
                value={incurredAt}
                onChange={(e) => setIncurredAt(e.target.value)}
                aria-invalid={!!errMsg("incurred_at")}
              />
              {errMsg("incurred_at") && (
                <p className="text-[11px] text-destructive">{errMsg("incurred_at")}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-status">{t("expenses.fields.status")}</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ExpenseStatus)}>
                <SelectTrigger id="ex-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`expenses.status.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-paid">{t("expenses.fields.paidAt")}</Label>
              <Input
                id="ex-paid"
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                aria-invalid={!!errMsg("paid_at")}
              />
              {errMsg("paid_at") && (
                <p className="text-[11px] text-destructive">{errMsg("paid_at")}</p>
              )}
            </div>
            <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 sm:col-span-2">
              <div className="space-y-0.5">
                <Label htmlFor="ex-rebill" className="cursor-pointer">
                  {t("expenses.fields.rebillable")}
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  {t("expenses.fields.rebillableHint")}
                </p>
              </div>
              <Switch id="ex-rebill" checked={rebillable} onCheckedChange={setRebillable} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ex-notes">{t("expenses.fields.notes")}</Label>
              <Textarea
                id="ex-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("expenses.dialog.cancel")}
            </Button>
            <Button type="submit" disabled={upsert.isPending || !isValid}>
              {initial?.id ? t("expenses.dialog.save") : t("expenses.dialog.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
