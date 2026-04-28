/**
 * Quote Time-Based Settings Tab
 *
 * Visible only when quote.quote_type is `construction_retainer` or
 * `consultancy_hours_package`. Reads/writes
 * `fee_proposals.time_based_settings` (JSONB) via the standard supabase
 * client.
 *
 * The UI shows a different panel per type with live calculated totals.
 * "Save" persists the JSON; "Regenerate proposal" is intentionally NOT
 * triggered from here — the user does that from the Proposal tab.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatEUR } from "@/lib/crm/types";
import {
  consultancyBlockValue,
  consultancyDownpayment,
  consultancyMinimumHours,
  defaultConsultancySettings,
  defaultRetainerSettings,
  parseTimeBasedSettings,
  retainerMonthlyEstimate,
  type ConstructionRetainerSettings,
  type ConsultancyHoursPackageSettings,
  type RetainerMonthlyResource,
  type TimeBasedSettings,
} from "@/lib/quotes/time-based-settings";

interface Props {
  quoteId: string;
  quoteType: string | null | undefined;
  /** Top-level category. Drives which editor renders:
   *  - "time_based" / legacy "consultancy" → consultancy hours-package editor
   *  - "retainer" → construction retainer editor
   *  - "project" → optional add-on (legacy retainer/consultancy figures inside
   *    the generated proposal). User can pick which add-on via the toggle.
   */
  quoteCategory?: "project" | "time_based" | "retainer" | "consultancy";
}

export function QuoteTimeBasedSettingsTab({ quoteId, quoteType, quoteCategory }: Props) {
  const { t } = useTranslation("crm");
  const qc = useQueryClient();

  // Determine the locked editor kind from the category. "project" means the
  // user can choose between the two legacy add-ons.
  const lockedKind: "construction_retainer" | "consultancy_hours_package" | null =
    quoteCategory === "retainer"
      ? "construction_retainer"
      : quoteCategory === "time_based" || quoteCategory === "consultancy"
        ? "consultancy_hours_package"
        : null;

  const { data: row, isLoading } = useQuery({
    queryKey: ["fee_proposal_time_based_settings", quoteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_proposals")
        .select("time_based_settings, quote_type")
        .eq("id", quoteId)
        .single();
      if (error) throw error;
      return data as { time_based_settings: unknown; quote_type: string };
    },
  });

  const [settings, setSettings] = useState<TimeBasedSettings | null>(null);

  useEffect(() => {
    if (!row) return;
    // Prefer the locked kind (from category) when parsing; otherwise fall
    // back to whatever the saved JSON / quote_type implied.
    const discriminator = lockedKind ?? row.quote_type ?? quoteType;
    const parsed = parseTimeBasedSettings(row.time_based_settings, discriminator);
    setSettings(parsed);
  }, [row, quoteType, lockedKind]);

  const save = useMutation({
    mutationFn: async () => {
      if (!settings) throw new Error("No settings to save");
      const { error } = await supabase
        .from("fee_proposals")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ time_based_settings: settings as any })
        .eq("id", quoteId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("workspace.timeBased.savedToast"));
      qc.invalidateQueries({ queryKey: ["fee_proposal_time_based_settings", quoteId] });
      qc.invalidateQueries({ queryKey: ["fee_proposal", quoteId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  if (!settings) {
    // Fallback — initialize from the locked kind (or quoteType for legacy).
    const initialKind = lockedKind ?? quoteType;
    const initial =
      initialKind === "consultancy_hours_package"
        ? defaultConsultancySettings()
        : defaultRetainerSettings();
    setSettings(initial);
    return null;
  }

  // Project category may show the kind-picker (optional add-on). The two
  // dedicated categories (time_based / retainer) lock the editor.
  const isProjectCategory = quoteCategory === "project" || (!quoteCategory && quoteType === "standard_project");

  const switchKind = (next: "construction_retainer" | "consultancy_hours_package") => {
    if (settings.kind === next) return;
    setSettings(
      next === "consultancy_hours_package"
        ? defaultConsultancySettings()
        : defaultRetainerSettings(),
    );
  };

  return (
    <div className="space-y-4">
      {isProjectCategory && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("workspace.timeBased.kindPickerTitle", "Time-based fee model")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {t(
                "workspace.timeBased.kindPickerHint",
                "This quote is a standard project. Use the panel below if you also want to surface monthly retainer or hourly consultancy figures inside the generated proposal.",
              )}
            </p>
            <div className="inline-flex rounded-md border bg-muted/30 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => switchKind("construction_retainer")}
                className={`rounded px-3 py-1 transition-colors ${
                  settings.kind === "construction_retainer"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("quoteType.construction_retainer.label")}
              </button>
              <button
                type="button"
                onClick={() => switchKind("consultancy_hours_package")}
                className={`rounded px-3 py-1 transition-colors ${
                  settings.kind === "consultancy_hours_package"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("quoteType.consultancy_hours_package.label")}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {settings.kind === "construction_retainer" && (
        <RetainerPanel settings={settings} onChange={setSettings} />
      )}
      {settings.kind === "consultancy_hours_package" && (
        <ConsultancyPanel settings={settings} onChange={setSettings} />
      )}

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}

// ───────────────────────── Retainer ─────────────────────────

function RetainerPanel({
  settings,
  onChange,
}: {
  settings: ConstructionRetainerSettings;
  onChange: (s: ConstructionRetainerSettings) => void;
}) {
  const { t } = useTranslation("crm");
  const monthly = useMemo(() => retainerMonthlyEstimate(settings), [settings]);

  const set = <K extends keyof ConstructionRetainerSettings>(
    key: K,
    value: ConstructionRetainerSettings[K],
  ) => onChange({ ...settings, [key]: value });

  const updateRow = (idx: number, patch: Partial<RetainerMonthlyResource>) => {
    const next = settings.monthly_resources.map((r, i) =>
      i === idx ? { ...r, ...patch } : r,
    );
    onChange({ ...settings, monthly_resources: next });
  };

  const addRow = () =>
    onChange({
      ...settings,
      monthly_resources: [
        ...settings.monthly_resources,
        { label: "", hours_per_month: 0, hourly_rate: 0 },
      ],
    });

  const removeRow = (idx: number) =>
    onChange({
      ...settings,
      monthly_resources: settings.monthly_resources.filter((_, i) => i !== idx),
    });

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("workspace.timeBased.retainer.basicsTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>{t("workspace.timeBased.retainer.startDate")}</Label>
            <Input
              type="date"
              value={settings.start_date ?? ""}
              onChange={(e) => set("start_date", e.target.value || null)}
            />
          </div>
          <div>
            <Label>{t("workspace.timeBased.retainer.estimatedEndDate")}</Label>
            <Input
              type="date"
              value={settings.estimated_end_date ?? ""}
              onChange={(e) => set("estimated_end_date", e.target.value || null)}
            />
          </div>
          <div className="sm:col-span-2 text-xs text-muted-foreground">
            {t("workspace.timeBased.retainer.billingModeNote")}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            {t("workspace.timeBased.retainer.resourcesTitle")}
          </CardTitle>
          <Button size="sm" variant="outline" onClick={addRow}>
            <Plus className="h-3.5 w-3.5 mr-1" /> {t("workspace.timeBased.retainer.addRow")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {settings.monthly_resources.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">
              {t("workspace.timeBased.retainer.resourcesEmpty")}
            </p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <div className="col-span-5">{t("workspace.timeBased.retainer.role")}</div>
                <div className="col-span-3">{t("workspace.timeBased.retainer.hoursPerMonth")}</div>
                <div className="col-span-3">{t("workspace.timeBased.retainer.hourlyRate")}</div>
                <div className="col-span-1" />
              </div>
              {settings.monthly_resources.map((r, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <Input
                    className="col-span-5"
                    value={r.label}
                    placeholder={t("workspace.timeBased.retainer.rolePlaceholder")}
                    onChange={(e) => updateRow(i, { label: e.target.value })}
                  />
                  <Input
                    className="col-span-3"
                    type="number"
                    step="0.5"
                    value={r.hours_per_month || ""}
                    onChange={(e) =>
                      updateRow(i, { hours_per_month: Number(e.target.value) || 0 })
                    }
                  />
                  <Input
                    className="col-span-3"
                    type="number"
                    step="0.01"
                    value={r.hourly_rate || ""}
                    onChange={(e) =>
                      updateRow(i, { hourly_rate: Number(e.target.value) || 0 })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="col-span-1"
                    onClick={() => removeRow(i)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between border-t pt-3">
            <span className="text-sm text-muted-foreground">
              {t("workspace.timeBased.retainer.monthlyEstimate")}
            </span>
            <span className="text-lg font-semibold tabular-nums">{formatEUR(monthly)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("workspace.timeBased.retainer.reimbursableTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={3}
            value={settings.reimbursable_expenses_note}
            placeholder={t("workspace.timeBased.retainer.reimbursablePlaceholder")}
            onChange={(e) => set("reimbursable_expenses_note", e.target.value)}
          />
        </CardContent>
      </Card>
    </>
  );
}

// ─────────────────────── Consultancy ───────────────────────

function ConsultancyPanel({
  settings,
  onChange,
}: {
  settings: ConsultancyHoursPackageSettings;
  onChange: (s: ConsultancyHoursPackageSettings) => void;
}) {
  const { t } = useTranslation("crm");

  const minHours = useMemo(() => consultancyMinimumHours(settings), [settings]);
  const downpayment = useMemo(() => consultancyDownpayment(settings), [settings]);
  const blockValue = useMemo(() => consultancyBlockValue(settings), [settings]);

  const set = <K extends keyof ConsultancyHoursPackageSettings>(
    key: K,
    value: ConsultancyHoursPackageSettings[K],
  ) => onChange({ ...settings, [key]: value });

  const updatePhase = (
    idx: number,
    patch: Partial<{ label: string; estimated_hours: number | null }>,
  ) => {
    const next = settings.phases.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    onChange({ ...settings, phases: next });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("workspace.timeBased.consultancy.basicsTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>{t("workspace.timeBased.consultancy.hourlyRate")}</Label>
            <Input
              type="number"
              step="0.01"
              value={settings.hourly_rate ?? ""}
              onChange={(e) =>
                set("hourly_rate", e.target.value === "" ? null : Number(e.target.value))
              }
            />
          </div>
          <div>
            <Label>{t("workspace.timeBased.consultancy.hoursBlock")}</Label>
            <Input
              type="number"
              step="1"
              value={settings.hours_block ?? ""}
              onChange={(e) =>
                set("hours_block", e.target.value === "" ? null : Number(e.target.value))
              }
            />
          </div>
          <div>
            <Label>{t("workspace.timeBased.consultancy.minimumPercent")}</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step="1"
              value={settings.minimum_commitment_percent}
              onChange={(e) =>
                set("minimum_commitment_percent", Number(e.target.value) || 0)
              }
            />
          </div>
          <div className="sm:col-span-3 text-xs text-muted-foreground">
            {t("workspace.timeBased.consultancy.billingModeNote")}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("workspace.timeBased.consultancy.calculatedTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Stat
            label={t("workspace.timeBased.consultancy.minimumHours")}
            value={`${minHours.toFixed(1)} h`}
          />
          <Stat
            label={t("workspace.timeBased.consultancy.downpayment")}
            value={formatEUR(downpayment)}
          />
          <Stat
            label={t("workspace.timeBased.consultancy.blockValue")}
            value={formatEUR(blockValue)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("workspace.timeBased.consultancy.phasesTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-12 gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <div className="col-span-8">{t("workspace.timeBased.consultancy.phaseLabel")}</div>
            <div className="col-span-4">{t("workspace.timeBased.consultancy.estimatedHours")}</div>
          </div>
          {settings.phases.map((p, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <Input
                className="col-span-8"
                value={p.label}
                onChange={(e) => updatePhase(i, { label: e.target.value })}
              />
              <Input
                className="col-span-4"
                type="number"
                step="0.5"
                value={p.estimated_hours ?? ""}
                onChange={(e) =>
                  updatePhase(i, {
                    estimated_hours: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
