/**
 * Inline create dialog for a financial supplier or client.
 *
 * Used from places where the user is already mid-flow (bank reconciliation
 * classify dialog, financial document editor) and discovers that the
 * counterparty does not exist yet.
 *
 * Sources of truth:
 *   - client  → `companies` (with `is_client = true`) — same record as CRM/projects
 *   - supplier → `financial_suppliers`
 *
 * Minimal fields:
 *   - name (required)
 *   - NIF / tax number (optional)
 *   - email (optional)
 *   - notes (optional)
 *
 * On success, returns the new id and name via onCreated and the parent is
 * expected to invalidate the relevant list query and auto-select the result.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

export type CounterpartyKind = "supplier" | "client";

type Props = {
  kind: CounterpartyKind;
  /** Optional initial name pre-filled from the calling context. */
  defaultName?: string;
  /** Render the trigger inside the dialog (so callers can place it). */
  trigger?: React.ReactNode;
  /** Open state if you want to control externally. */
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  /** Called once the row exists. */
  onCreated: (row: { id: string; name: string }) => void;
};

export function InlineCounterpartyDialog({
  kind,
  defaultName,
  trigger,
  open: openProp,
  onOpenChange,
  onCreated,
}: Props) {
  const { t } = useTranslation(["finance", "common"]);
  const qc = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? !!openProp : internalOpen;
  const setOpen = (v: boolean) => {
    if (isControlled) onOpenChange?.(v);
    else setInternalOpen(v);
  };

  const [name, setName] = useState(defaultName ?? "");
  const [nif, setNif] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setName(defaultName ?? "");
    setNif("");
    setEmail("");
    setNotes("");
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t("finance:inlineCounterparty.nameRequired"));
      return;
    }
    setSaving(true);
    try {
      if (kind === "supplier") {
        // financial_suppliers: name, nif, notes, is_active
        const composedNotes = [notes.trim(), email.trim() ? `email: ${email.trim()}` : ""]
          .filter(Boolean)
          .join("\n");
        const { data, error } = await supabase
          .from("financial_suppliers")
          .insert({
            name: trimmed,
            nif: nif.trim() || null,
            notes: composedNotes || null,
            is_active: true,
          })
          .select("id, name")
          .single();
        if (error) throw error;
        await qc.invalidateQueries({ queryKey: ["fin-suppliers"] });
        await qc.invalidateQueries({ queryKey: ["finance", "suppliers"] });
        toast.success(t("finance:inlineCounterparty.supplierCreated"));
        onCreated({ id: data.id, name: data.name });
      } else {
        // Clients live on companies (unified). Mark is_client=true so the
        // record appears in the finance client master list and pickers.
        const { data, error } = await supabase
          .from("companies")
          .insert({
            nome: trimmed,
            nif: nif.trim() || null,
            email: email.trim() || null,
            notas: notes.trim() || null,
            is_client: true,
            is_active: true,
          })
          .select("id, nome")
          .single();
        if (error) throw error;
        await qc.invalidateQueries({ queryKey: ["fin-clients"] });
        await qc.invalidateQueries({ queryKey: ["finance", "clients"] });
        await qc.invalidateQueries({ queryKey: ["companies"] });
        toast.success(t("finance:inlineCounterparty.clientCreated"));
        onCreated({ id: data.id, name: data.nome });
      }
      reset();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const title =
    kind === "supplier"
      ? t("finance:inlineCounterparty.newSupplier")
      : t("finance:inlineCounterparty.newClient");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      {trigger ? (
        <span onClick={() => setOpen(true)} className="contents">
          {trigger}
        </span>
      ) : null}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="size-4" /> {title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">{t("finance:inlineCounterparty.name")} *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder={t("finance:inlineCounterparty.namePlaceholder")}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">{t("finance:inlineCounterparty.nif")}</Label>
              <Input value={nif} onChange={(e) => setNif(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("finance:inlineCounterparty.email")}</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("finance:inlineCounterparty.notes")}</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            {t("common:cancel")}
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="size-4 mr-1 animate-spin" /> : null}
            {t("common:save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
