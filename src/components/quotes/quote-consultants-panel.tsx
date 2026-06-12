/**
 * QuoteConsultantsPanel — manages supplier groups + supplier phases
 * (consultants) for a quote. Each consultant becomes a `supplier_group`
 * stage with one `supplier_phase` child per shadowed architecture stage,
 * plus an SS=0 quote_stage_dependency so moving the architecture stage
 * cascades to the consultant phase (reuses the existing cascade hook).
 *
 * No fee math here — supplier payouts are produced by the
 * "Architecture + Consultants" generator in the payment-schedule tab.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useQuoteStages, useUpsertQuoteStage, useDeleteQuoteStage } from "@/lib/quotes/use-quote-stages";
import { useQuoteDependencies, useCreateQuoteDependency } from "@/lib/quotes/use-quote-dependencies";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type Row = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  sort_order: number | null;
  stage_role?: string | null;
  parent_stage_id?: string | null;
  supplier_company_id?: string | null;
  linked_stage_id?: string | null;
};

function useCompanies() {
  return useQuery({
    queryKey: ["companies-list-min"],
    queryFn: async (): Promise<{ id: string; nome: string }[]> => {
      const { data, error } = await db
        .from("companies")
        .select("id, nome")
        .order("nome", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; nome: string }[];
    },
  });
}

export function QuoteConsultantsPanel({ quoteId }: { quoteId: string }) {
  const { t } = useTranslation("crm");
  const qc = useQueryClient();
  const stagesQ = useQuoteStages(quoteId);
  const depsQ = useQuoteDependencies(quoteId);
  const companiesQ = useCompanies();
  const upsertStage = useUpsertQuoteStage(quoteId);
  const deleteStage = useDeleteQuoteStage(quoteId);
  const createDep = useCreateQuoteDependency(quoteId);

  const all = (stagesQ.data ?? []) as unknown as Row[];
  const archStages = useMemo(
    () => all
      .filter((s) => (s.stage_role ?? "architecture") === "architecture")
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [all],
  );
  const supplierGroups = useMemo(
    () => all.filter((s) => s.stage_role === "supplier_group"),
    [all],
  );
  const phasesByGroup = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const s of all) {
      if (s.stage_role === "supplier_phase" && s.parent_stage_id) {
        const arr = m.get(s.parent_stage_id) ?? [];
        arr.push(s);
        m.set(s.parent_stage_id, arr);
      }
    }
    return m;
  }, [all]);

  const companyName = (id: string | null | undefined): string => {
    if (!id) return "—";
    return companiesQ.data?.find((c) => c.id === id)?.nome ?? "—";
  };
  const archName = (id: string | null | undefined): string =>
    archStages.find((s) => s.id === id)?.name ?? "—";

  // Add-consultant form state
  const [companyId, setCompanyId] = useState<string>("");
  const [selectedArch, setSelectedArch] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const toggleArch = (id: string) => {
    setSelectedArch((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addConsultant = async () => {
    if (!companyId) {
      toast.error(t("workspace.consultants.errorPickCompany", { defaultValue: "Pick a supplier" }));
      return;
    }
    if (selectedArch.size === 0) {
      toast.error(t("workspace.consultants.errorPickPhases", { defaultValue: "Pick at least one phase" }));
      return;
    }
    setBusy(true);
    try {
      const archSelected = archStages.filter((s) => selectedArch.has(s.id));
      const minStart = archSelected.reduce(
        (m, s) => (s.start_date < m ? s.start_date : m),
        archSelected[0].start_date,
      );
      const maxEnd = archSelected.reduce(
        (m, s) => (s.end_date > m ? s.end_date : m),
        archSelected[0].end_date,
      );
      const companyLabel = companyName(companyId);
      const maxOrder = all.reduce((m, s) => Math.max(m, s.sort_order ?? 0), 0);

      const groupRow = await upsertStage.mutateAsync({
        quote_id: quoteId,
        name: companyLabel,
        start_date: minStart,
        end_date: maxEnd,
        budget: 0,
        sort_order: maxOrder + 1,
        color: "#94a3b8",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...( { stage_role: "supplier_group", supplier_company_id: companyId, parent_stage_id: archSelected[0].id } as any),
      });

      let order = (groupRow.sort_order ?? maxOrder + 1) + 1;
      for (const arch of archSelected) {
        const phase = await upsertStage.mutateAsync({
          quote_id: quoteId,
          name: arch.name,
          start_date: arch.start_date,
          end_date: arch.end_date,
          budget: 0,
          sort_order: order++,
          color: "#cbd5e1",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...( { stage_role: "supplier_phase", supplier_company_id: companyId, parent_stage_id: groupRow.id, linked_stage_id: arch.id } as any),
        });
        await createDep.mutateAsync({
          quote_id: quoteId,
          predecessor_stage_id: arch.id,
          successor_stage_id: phase.id,
          type: "SS",
          lag_days: 0,
        });
      }
      setCompanyId("");
      setSelectedArch(new Set());
      toast.success(t("workspace.consultants.added", { defaultValue: "Consultant added" }));
      qc.invalidateQueries({ queryKey: ["quote-stages", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-dependencies", quoteId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removeConsultant = async (groupId: string) => {
    if (!confirm(t("workspace.consultants.deleteConfirm", { defaultValue: "Remove this consultant and all its phases?" }))) return;
    try {
      // Child phases are removed by FK ON DELETE CASCADE on parent_stage_id.
      await deleteStage.mutateAsync(groupId);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("workspace.consultants.title", { defaultValue: "Consultants" })}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Existing groups */}
        {supplierGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("workspace.consultants.empty", { defaultValue: "No consultants yet. Add one below." })}
          </p>
        ) : (
          <div className="space-y-3">
            {supplierGroups.map((g) => {
              const phases = phasesByGroup.get(g.id) ?? [];
              return (
                <div key={g.id} className="rounded-md border border-border bg-muted/30 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{companyName(g.supplier_company_id)}</div>
                      <div className="text-xs text-muted-foreground">
                        {phases.length}{" "}
                        {t("workspace.consultants.phaseCount", { defaultValue: "phase(s)" })}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => removeConsultant(g.id)}
                      aria-label={t("workspace.consultants.remove", { defaultValue: "Remove" })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {phases.length > 0 && (
                    <div className="mt-2 space-y-1 text-xs">
                      {phases.map((p) => (
                        <div key={p.id} className="flex items-center justify-between rounded bg-background/60 px-2 py-1">
                          <span className="truncate">└─ {archName(p.linked_stage_id)}</span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {p.start_date} → {p.end_date}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Add consultant form */}
        <div className="rounded-md border border-dashed border-border p-3 space-y-3">
          <div className="text-xs font-medium text-muted-foreground">
            {t("workspace.consultants.addTitle", { defaultValue: "Add consultant" })}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label className="text-xs">
                {t("workspace.consultants.supplier", { defaultValue: "Supplier company" })}
              </Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("workspace.consultants.supplierPlaceholder", { defaultValue: "Pick a company" })} />
                </SelectTrigger>
                <SelectContent>
                  {(companiesQ.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">
                {t("workspace.consultants.phases", { defaultValue: "Architecture phases to shadow" })}
              </Label>
              <div className="mt-1 max-h-48 overflow-auto rounded border border-border bg-background p-2 space-y-1">
                {archStages.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("workspace.consultants.noArch", { defaultValue: "Create architecture stages first." })}
                  </p>
                ) : (
                  archStages.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-xs cursor-pointer">
                      <Checkbox
                        checked={selectedArch.has(s.id)}
                        onCheckedChange={() => toggleArch(s.id)}
                      />
                      <span className="truncate">{s.name}</span>
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                        {s.start_date} → {s.end_date}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="button" size="sm" disabled={busy} onClick={addConsultant}>
              <Plus className="mr-1 h-4 w-4" />
              {t("workspace.consultants.add", { defaultValue: "Add consultant" })}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t("workspace.consultants.hint", { defaultValue: "Each phase gets an SS=0 dependency on its architecture stage — moving the architecture stage moves the consultant phase automatically." })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
