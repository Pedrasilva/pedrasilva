/**
 * PSA Proposal Ontology — Milestone 3
 * Lightweight "intelligent defaults" surface beneath the existing PSA Hub
 * proposal workflow. Lets the user pick a preset, toggle optional phases,
 * and apply (or re-apply) the canonical bootstrap plan.
 *
 * This component is a thin consumer of the orchestration layer. It does
 * NOT compute plans, write to DB directly, or replace any existing UI.
 * Manual edits on stages / payment items are always preserved by the
 * apply step (see proposal-ontology/bootstrap/apply.ts).
 */
import { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Sparkles, RefreshCcw, CheckCircle2 } from "lucide-react";
import {
  useProposalPresets,
  useProposalFamilies,
  useProposalPhases,
  useProposalDeliveryModes,
} from "@/lib/proposal-ontology/use-ontology";
import {
  useBootstrapQuoteFromPreset,
  type ApplyBootstrapResult,
} from "@/lib/proposal-ontology/bootstrap";

const today = () => new Date().toISOString().slice(0, 10);

interface Props {
  quoteId: string;
  /** Initial ontology metadata from the quote row (if previously bootstrapped). */
  initialFamilyCode?: string | null;
  initialPresetCode?: string | null;
  initialDeliveryMode?: string | null;
  initialBootstrappedAt?: string | null;
}

export function QuoteOntologyBootstrapCard({
  quoteId,
  initialFamilyCode,
  initialPresetCode,
  initialDeliveryMode,
  initialBootstrappedAt,
}: Props) {
  const { t, i18n } = useTranslation("crm");
  const locale = i18n.language.startsWith("pt") ? "pt-PT" : "en";

  const presetsQ = useProposalPresets();
  const familiesQ = useProposalFamilies();
  const phasesQ = useProposalPhases();
  const deliveryQ = useProposalDeliveryModes();

  const presets = presetsQ.data ?? [];
  const families = familiesQ.data ?? [];
  const phases = phasesQ.data ?? [];
  const deliveryModes = deliveryQ.data ?? [];

  // ---- Family / preset selection -------------------------------------
  const [familyCode, setFamilyCode] = useState<string>(initialFamilyCode ?? "");
  const [presetCode, setPresetCode] = useState<string>(initialPresetCode ?? "");
  const [projectStart, setProjectStart] = useState<string>(today());

  // Sync external initial values once they load.
  useEffect(() => {
    if (initialFamilyCode && !familyCode) setFamilyCode(initialFamilyCode);
    if (initialPresetCode && !presetCode) setPresetCode(initialPresetCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFamilyCode, initialPresetCode]);

  const presetsForFamily = useMemo(
    () => (familyCode ? presets.filter((p) => p.family_code === familyCode) : presets),
    [presets, familyCode],
  );

  const selectedPreset = useMemo(
    () => presets.find((p) => p.code === presetCode) ?? null,
    [presets, presetCode],
  );

  // When a preset is picked, auto-align family + initial optional toggles.
  useEffect(() => {
    if (selectedPreset?.family_code && selectedPreset.family_code !== familyCode) {
      setFamilyCode(selectedPreset.family_code);
    }
    if (selectedPreset) {
      const enabled = (selectedPreset.enabled_phases ?? []) as string[];
      setOptionalPhases(Object.fromEntries(enabled.map((c) => [c, true])));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetCode]);

  // ---- Optional phase toggles ----------------------------------------
  // Optional phases = any phase the preset COULD enable. We default-on the
  // ones already in preset.enabled_phases and let the user trim/extend.
  const [optionalPhases, setOptionalPhases] = useState<Record<string, boolean>>({});

  const togglablePhases = useMemo(() => {
    if (!selectedPreset) return [];
    // Treat the union of preset.enabled_phases + every parallel_addon /
    // operational_recurring phase + a small finite extension set as the
    // togglable surface. Keep it lightweight — no enterprise UI.
    const presetSet = new Set(((selectedPreset.enabled_phases ?? []) as string[]));
    return phases.filter(
      (p) =>
        presetSet.has(p.code) ||
        p.phase_class === "parallel_addon" ||
        p.phase_class === "operational_recurring",
    );
  }, [phases, selectedPreset]);

  const selectedDelivery = useMemo(() => {
    const code = selectedPreset?.default_delivery_mode ?? initialDeliveryMode ?? null;
    return code ? deliveryModes.find((d) => d.code === code) ?? null : null;
  }, [selectedPreset, initialDeliveryMode, deliveryModes]);

  // ---- Apply ----------------------------------------------------------
  const { bootstrap, isPending } = useBootstrapQuoteFromPreset();
  const [lastResult, setLastResult] = useState<ApplyBootstrapResult | null>(null);

  const handleApply = async () => {
    if (!selectedPreset) {
      toast.error(t("ontology.errorNoPreset"));
      return;
    }
    try {
      const enabledOverride = Object.entries(optionalPhases)
        .filter(([, on]) => on)
        .map(([code]) => code);

      const original = (selectedPreset.enabled_phases ?? []) as string[];
      const overrideChanged =
        JSON.stringify([...enabledOverride].sort()) !==
        JSON.stringify([...original].sort());

      const result = await bootstrap({
        quoteId,
        presetCode: selectedPreset.code,
        projectStart,
        enabledPhasesOverride: overrideChanged ? enabledOverride : undefined,
        flags: { ui_phase_overrides: enabledOverride },
      });

      setLastResult(result);
      toast.success(
        t("ontology.applyToast", {
          stages: result.stagesCreated + result.stagesUpdated,
          payments: result.paymentItemsCreated,
        }),
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // ---- Render ---------------------------------------------------------
  const alreadyBootstrapped = !!initialBootstrappedAt;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {t("ontology.title")}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {t("ontology.subtitle")}
          </p>
        </div>
        {alreadyBootstrapped && (
          <Badge variant="secondary" className="text-[10px]">
            {t("ontology.bootstrappedBadge")}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Family + preset row */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-xs">{t("ontology.family")}</Label>
            <Select
              value={familyCode || undefined}
              onValueChange={(v) => {
                setFamilyCode(v);
                setPresetCode("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("ontology.familyPh")} />
              </SelectTrigger>
              <SelectContent>
                {families.map((f) => (
                  <SelectItem key={f.code} value={f.code}>
                    {locale === "pt-PT" ? f.label_pt : f.label_en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{t("ontology.preset")}</Label>
            <Select value={presetCode || undefined} onValueChange={setPresetCode}>
              <SelectTrigger>
                <SelectValue placeholder={t("ontology.presetPh")} />
              </SelectTrigger>
              <SelectContent>
                {presetsForFamily.map((p) => (
                  <SelectItem key={p.code} value={p.code}>
                    {locale === "pt-PT" ? p.label_pt : p.label_en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{t("ontology.projectStart")}</Label>
            <Input
              type="date"
              value={projectStart}
              onChange={(e) => setProjectStart(e.target.value)}
            />
          </div>
        </div>

        {/* Delivery mode (auto from preset) */}
        {selectedDelivery && (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
            <span className="text-muted-foreground mr-2">
              {t("ontology.deliveryMode")}:
            </span>
            <span className="font-medium">
              {locale === "pt-PT" ? selectedDelivery.label_pt : selectedDelivery.label_en}
            </span>
            {selectedDelivery.description_en && (
              <p className="mt-1 text-muted-foreground">
                {locale === "pt-PT"
                  ? selectedDelivery.description_pt
                  : selectedDelivery.description_en}
              </p>
            )}
          </div>
        )}

        {/* Optional phase toggles */}
        {selectedPreset && togglablePhases.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("ontology.optionalPhases")}
            </Label>
            <div className="flex flex-wrap gap-2">
              {togglablePhases.map((p) => {
                const on = !!optionalPhases[p.code];
                return (
                  <label
                    key={p.code}
                    className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs cursor-pointer hover:bg-accent/40"
                  >
                    <Checkbox
                      checked={on}
                      onCheckedChange={(v) =>
                        setOptionalPhases((prev) => ({ ...prev, [p.code]: Boolean(v) }))
                      }
                    />
                    <span>{locale === "pt-PT" ? p.label_pt : p.label_en}</span>
                    <span className="text-[10px] text-muted-foreground">{p.code}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Apply button */}
        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          {alreadyBootstrapped && (
            <span className="text-[11px] text-muted-foreground mr-auto">
              {t("ontology.preserveManualHint")}
            </span>
          )}
          <Button
            size="sm"
            disabled={!selectedPreset || isPending}
            onClick={handleApply}
            variant={alreadyBootstrapped ? "outline" : "default"}
          >
            {alreadyBootstrapped ? (
              <>
                <RefreshCcw className="h-3.5 w-3.5 mr-1.5" />
                {t("ontology.reapply")}
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                {t("ontology.apply")}
              </>
            )}
          </Button>
        </div>

        {/* Lightweight bootstrap summary */}
        {lastResult && (
          <div className="rounded-md border bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-900/40 px-3 py-2 text-xs space-y-0.5">
            <div className="flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t("ontology.summaryTitle")}
            </div>
            <SummaryLine label={t("ontology.summary.stages")}
              value={`${lastResult.stagesCreated} + ${lastResult.stagesUpdated} (${lastResult.stagesDeleted} ${t("ontology.summary.removed")})`} />
            <SummaryLine label={t("ontology.summary.dependencies")}
              value={`${lastResult.dependenciesCreated}`} />
            <SummaryLine label={t("ontology.summary.payments")}
              value={`${lastResult.paymentItemsCreated}`} />
            {lastResult.preservedManual > 0 && (
              <SummaryLine label={t("ontology.summary.preserved")}
                value={`${lastResult.preservedManual}`} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
