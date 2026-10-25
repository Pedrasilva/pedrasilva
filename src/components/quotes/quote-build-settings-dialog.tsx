import { translateError } from '@/lib/translate-error';
import { useTranslation } from "react-i18next";
import uiI18n from "@/i18n/index";
/**
 * Quote Build Settings — dialog opened from the settings gear next to
 * "Update schedule" in the quote header. Houses common quote-build
 * preferences (down payment, etc.). Persists to
 * `fee_proposals.quote_build_settings` (JSONB) via an explicit Save button.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings, Loader2 } from "lucide-react";
import { toast } from '@/lib/toast';
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DEFAULT_STAGE_MILESTONE_OPTIONS } from "@/lib/quotes/payment-generators";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface QuoteBuildSettings {
  downPaymentEnabled: boolean;
  downPaymentPercent: number;
  deductDownPaymentFromStages: boolean;
  vatEnabled: boolean;
}

function defaults(): QuoteBuildSettings {
  return {
    downPaymentEnabled: DEFAULT_STAGE_MILESTONE_OPTIONS.downPaymentEnabled,
    downPaymentPercent: DEFAULT_STAGE_MILESTONE_OPTIONS.downPaymentPercent,
    deductDownPaymentFromStages: !!DEFAULT_STAGE_MILESTONE_OPTIONS.deductDownPaymentFromStages,
    vatEnabled: true,
  };
}

function fromRaw(raw: Record<string, unknown> | null | undefined): QuoteBuildSettings {
  const d = defaults();
  if (!raw) return d;
  return {
    downPaymentEnabled: raw.downPaymentEnabled === undefined
      ? d.downPaymentEnabled
      : Boolean(raw.downPaymentEnabled),
    downPaymentPercent: raw.downPaymentPercent === undefined
      ? d.downPaymentPercent
      : Number(raw.downPaymentPercent) || 0,
    deductDownPaymentFromStages: raw.deductDownPaymentFromStages === undefined
      ? d.deductDownPaymentFromStages
      : Boolean(raw.deductDownPaymentFromStages),
    vatEnabled: raw.vatEnabled === undefined ? d.vatEnabled : Boolean(raw.vatEnabled),
  };
}


export function QuoteBuildSettingsDialog({
  quoteId,
  disabled,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  hideTrigger = false,
}: {
  quoteId: string;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  hideTrigger?: boolean;
}) {
  useTranslation();
  const qc = useQueryClient();
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = onOpenChangeProp ?? setOpenState;


  // Preserve keys we don't manage here (e.g. projectBilling).
  const rawRef = useRef<Record<string, unknown>>({});

  const q = useQuery({
    queryKey: ["quote-build-settings", quoteId],
    enabled: !!quoteId,
    queryFn: async (): Promise<QuoteBuildSettings> => {
      const { data, error } = await db
        .from("fee_proposals")
        .select("quote_build_settings")
        .eq("id", quoteId)
        .single();
      if (error) throw new Error(error.message);
      rawRef.current = ((data as { quote_build_settings: Record<string, unknown> | null } | null)?.quote_build_settings ?? {}) as Record<string, unknown>;
      return fromRaw((data as { quote_build_settings: Record<string, unknown> | null } | null)?.quote_build_settings);
    },
  });

  const [draft, setDraft] = useState<QuoteBuildSettings>(defaults());

  useEffect(() => {
    if (q.data) setDraft(q.data);
  }, [q.data]);

  const save = useMutation({
    mutationFn: async (next: QuoteBuildSettings) => {
      // Re-read so keys managed elsewhere (projectBilling) are never dropped.
      const { data: fresh, error: readError } = await db
        .from("fee_proposals")
        .select("quote_build_settings")
        .eq("id", quoteId)
        .single();
      if (readError) throw new Error(readError.message);
      const current = ((fresh as { quote_build_settings: Record<string, unknown> | null } | null)
        ?.quote_build_settings ?? rawRef.current) as Record<string, unknown>;
      const { error } = await db
        .from("fee_proposals")
        .update({ quote_build_settings: { ...current, ...next } })
        .eq("id", quoteId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quote-build-settings", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-build-settings-raw", quoteId] });
      qc.invalidateQueries({ queryKey: ["fee-proposal-summary", quoteId] });
      qc.invalidateQueries({ queryKey: ["fee_proposal", quoteId] });
      qc.invalidateQueries({ queryKey: ["psa-live-quote", quoteId] });

      toast.success(uiI18n.t("crm:quoteEditor.settingsSaved"));
      setOpen(false);
    },
    onError: (e: Error) => toast.error(translateError(e.message)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={disabled}
            title={uiI18n.t("crm:quoteEditor.buildSettings")}
          >
            <Settings className="h-4 w-4" />
             {uiI18n.t("common:settings")} </Button>
        </DialogTrigger>
      )}

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle> {uiI18n.t("crm:quoteEditor.buildSettings")} </DialogTitle>
          <DialogDescription>
             {uiI18n.t("crm:quoteEditor.buildSettingsHint")} </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md border p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-sm font-medium"> {uiI18n.t("crm:workspace.timeBased.consultancy.downpayment")} </Label>
                <p className="text-xs text-muted-foreground">
                   {uiI18n.t("crm:quoteEditor.upfrontHint")} </p>
              </div>
              <Switch
                checked={draft.downPaymentEnabled}
                onCheckedChange={(v) => setDraft({ ...draft, downPaymentEnabled: v })}
              />
            </div>

            <div className="grid grid-cols-2 items-center gap-3">
              <Label htmlFor="dp-pct" className="text-xs text-muted-foreground">
                 {uiI18n.t("crm:workspace.payment.downPaymentPercent")} </Label>
              <Input
                id="dp-pct"
                type="number"
                min={0}
                max={100}
                step="0.5"
                value={draft.downPaymentPercent}
                disabled={!draft.downPaymentEnabled}
                onChange={(e) =>
                  setDraft({ ...draft, downPaymentPercent: Number(e.target.value) || 0 })
                }
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <Label className="text-xs text-muted-foreground">
                 {uiI18n.t("crm:quoteEditor.deductStagePayments")} </Label>
              <Switch
                checked={draft.deductDownPaymentFromStages}
                disabled={!draft.downPaymentEnabled}
                onCheckedChange={(v) =>
                  setDraft({ ...draft, deductDownPaymentFromStages: v })
                }
              />
            </div>
          </div>

          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-sm font-medium"> {uiI18n.t("crm:quoteEditor.vat")} </Label>
                <p className="text-xs text-muted-foreground">
                   {uiI18n.t("crm:quoteEditor.vatHint")} </p>
              </div>
              <Switch
                checked={draft.vatEnabled}
                onCheckedChange={(v) => setDraft({ ...draft, vatEnabled: v })}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
             {uiI18n.t("crm:quoteEditor.nextRunPrefix")} {" "}
            <span className="font-medium"> {uiI18n.t("crm:workspace.payment.headerUpdate")} </span>  {uiI18n.t("crm:quoteEditor.runSuffix")} </p>

        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={save.isPending}>
             {uiI18n.t("common:cancel")} </Button>
          <Button onClick={() => save.mutate(draft)} disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
             {uiI18n.t("common:save")} </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
