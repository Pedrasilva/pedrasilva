/**
 * Supplier create / edit form. Used both standalone (from the Manager) and
 * from inside External services as an inline-create surface.
 *
 * On save we resolve back to the created/updated supplier record so callers
 * can auto-select it.
 */

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
import { Switch } from "@/components/ui/switch";
import {
  supplierSchema,
  useUpsertSupplier,
  type Supplier,
} from "@/lib/projects/use-suppliers";
import { flattenIssues } from "@/lib/projects/financial-validation";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Supplier | null;
  /** Called with the persisted supplier — use to auto-select after inline create. */
  onSaved?: (supplier: Supplier) => void;
  /** Pre-fill the name when opened — useful for "Create '<query>'" shortcut. */
  defaultName?: string;
}

export function SupplierFormDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
  defaultName,
}: Props) {
  const { t } = useTranslation("projects");
  const upsert = useUpsertSupplier();

  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [taxId, setTaxId] = useState("");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? defaultName ?? "");
    setContactName(initial?.contact_name ?? "");
    setEmail(initial?.email ?? "");
    setPhone(initial?.phone ?? "");
    setTaxId(initial?.tax_id ?? "");
    setNotes(initial?.notes ?? "");
    setActive(initial?.active ?? true);
  }, [open, initial, defaultName]);

  const parseResult = supplierSchema.safeParse({
    name,
    contact_name: contactName,
    email,
    phone,
    tax_id: taxId,
    notes,
    active,
  });
  const errors = flattenIssues(parseResult);
  const isValid = parseResult.success;
  const errMsg = (key: string) =>
    errors[key] ? t(`suppliers.dialog.errors.${errors[key]}`) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) {
      toast.error(t("suppliers.dialog.errors.formInvalid"));
      return;
    }
    try {
      const payload = {
        name: name.trim(),
        contact_name: contactName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        tax_id: taxId.trim() || null,
        notes: notes.trim() || null,
        active,
        ...(initial?.id ? { id: initial.id } : {}),
      };
      const saved = await upsert.mutateAsync(payload);
      toast.success(
        initial?.id
          ? t("suppliers.dialog.toast.updated")
          : t("suppliers.dialog.toast.created"),
      );
      onSaved?.(saved);
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
            {initial?.id
              ? t("suppliers.dialog.editTitle")
              : t("suppliers.dialog.createTitle")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="sup-name">{t("suppliers.fields.name")}</Label>
              <Input
                id="sup-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("suppliers.fields.namePlaceholder")}
                aria-invalid={!!errMsg("name")}
                autoFocus
              />
              {errMsg("name") && (
                <p className="text-[11px] text-destructive">{errMsg("name")}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-contact">{t("suppliers.fields.contactName")}</Label>
              <Input
                id="sup-contact"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-email">{t("suppliers.fields.email")}</Label>
              <Input
                id="sup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!errMsg("email")}
              />
              {errMsg("email") && (
                <p className="text-[11px] text-destructive">{errMsg("email")}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-phone">{t("suppliers.fields.phone")}</Label>
              <Input
                id="sup-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-tax">{t("suppliers.fields.taxId")}</Label>
              <Input
                id="sup-tax"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="sup-notes">{t("suppliers.fields.notes")}</Label>
              <Textarea
                id="sup-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 sm:col-span-2">
              <div className="space-y-0.5">
                <Label htmlFor="sup-active" className="cursor-pointer">
                  {t("suppliers.fields.active")}
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  {t("suppliers.fields.activeHint")}
                </p>
              </div>
              <Switch id="sup-active" checked={active} onCheckedChange={setActive} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("suppliers.dialog.cancel")}
            </Button>
            <Button type="submit" disabled={upsert.isPending || !isValid}>
              {initial?.id
                ? t("suppliers.dialog.save")
                : t("suppliers.dialog.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
