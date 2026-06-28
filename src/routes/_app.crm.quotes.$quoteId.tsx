import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useRecordRecentlyViewed } from "@/hooks/use-recently-viewed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { QuoteWorkflowActions } from "@/components/quotes/quote-workflow-actions";
import { InlineEditableTitle } from "@/components/inline-editable-title";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  QUOTE_STATUSES, FEE_STRUCTURE_TYPES, normalizeQuoteCategory,
  type FeeProposal, type QuoteStatus, type FeeStructureType,
} from "@/lib/crm/types";
import { QuotePlanningTab } from "@/components/quotes/quote-planning-tab";
import { QuoteExternalServicesTab } from "@/components/quotes/quote-external-services-tab";
import { QuotePaymentScheduleTab } from "@/components/quotes/quote-payment-schedule-tab";
import { QuoteFinancialSummaryTab } from "@/components/quotes/quote-financial-summary-tab";
import { QuoteProposalTab } from "@/components/quotes/quote-proposal-tab";
import { ApplyTemplateDialog } from "@/components/quotes/apply-template-dialog";
import { QuoteTimeBasedSettingsTab } from "@/components/quotes/quote-time-based-settings-tab";
import { QuoteFeeCalculatorCard } from "@/components/quotes/quote-fee-calculator-card";
import { QuoteOntologyBootstrapCard } from "@/components/quotes/quote-ontology-bootstrap-card";
import { QuoteCreateContractCard } from "@/components/quotes/quote-create-contract-card";
import {
  QuoteWorkflowStepper,
  type QuoteStep,
} from "@/components/quotes/quote-workflow-stepper";
import { QuotePublishStep } from "@/components/quotes/quote-publish-step";
import { SaveAsTemplateDialog } from "@/components/quotes/save-as-template-dialog";
import { QuoteLockBanner } from "@/components/quotes/quote-lock-banner";
import { useAuth } from "@/hooks/use-auth";
import { useQuoteStages } from "@/lib/quotes/use-quote-stages";
import { useQuoteAllocations } from "@/lib/quotes/use-quote-allocations";
import { useQuoteExternalServices } from "@/lib/quotes/use-quote-external-services";
import { useQuotePaymentSchedule } from "@/lib/quotes/use-quote-payment-schedule";
import { rollupQuote } from "@/lib/quotes/financial-rollups";
import {
  anchorMonthStart,
  anchorMonthEnd,
  shiftAnchor,
  formatAnchorMonth,
} from "@/lib/quotes/retainer-monthly";
import { parseISO, format as fmtDate, max as maxDate, min as minDate } from "date-fns";

export const Route = createFileRoute("/_app/crm/quotes/$quoteId")({
  component: QuoteDetail,
});

type FullQuote = FeeProposal & {
  opportunity: { id: string; name: string; stage: string; company_id: string } | null;
  account: { id: string; name: string } | null;
  company: { id: string; nome: string } | null;
  pricing_multiplier?: number | null;
  proposal_description?: string | null;
  construction_cost?: number | null;
  fee_percentage?: number | null;
  project_fee_calculation?: unknown;
};

function QuoteDetail() {
  const { t } = useTranslation("crm");
  const { quoteId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAdmin } = useAuth();

  const { data: quote, isLoading } = useQuery({
    queryKey: ["fee_proposal", quoteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_proposals")
        .select(`
          *,
          opportunity:crm_opportunities(id, name, stage, company_id),
          account:crm_accounts(id, name),
          company:companies(id, nome)
        `)
        .eq("id", quoteId)
        .single();
      if (error) throw error;
      return data as FullQuote;
    },
  });

  useRecordRecentlyViewed({
    module: "crm",
    href: `/crm/quotes/${quoteId}`,
    label: quote?.titulo ?? "",
  });



  const { data: accounts = [] } = useQuery({
    queryKey: ["crm_accounts_by_company", quote?.company_id],
    queryFn: async () => {
      if (!quote?.company_id) return [];
      const { data, error } = await supabase
        .from("crm_accounts")
        .select("id, name")
        .eq("company_id", quote.company_id)
        .order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
    enabled: !!quote?.company_id,
  });

  const [form, setForm] = useState({
    titulo: "",
    valor: "",
    fee_structure_type: "fixed" as FeeStructureType,
    account_id: "",
    quote_status: "draft" as QuoteStatus,
    notas: "",
    proposal_description: "",
    construction_cost: "",
    fee_percentage: "",
    pricing_multiplier: "1",
  });

  useEffect(() => {
    if (quote) {
      setForm({
        titulo: quote.titulo,
        valor: String(quote.valor),
        fee_structure_type: quote.fee_structure_type,
        account_id: quote.account_id ?? "",
        quote_status: quote.quote_status,
        notas: quote.notas ?? "",
        proposal_description: quote.proposal_description ?? "",
        construction_cost: quote.construction_cost != null ? String(quote.construction_cost) : "",
        fee_percentage: quote.fee_percentage != null ? String(quote.fee_percentage) : "",
        pricing_multiplier: String(quote.pricing_multiplier ?? 1),
      });
    }
  }, [quote]);

  const save = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: any = {
        titulo: form.titulo.trim(),
        valor: form.valor ? Number(form.valor) : 0,
        fee_structure_type: form.fee_structure_type,
        account_id: form.account_id || null,
        quote_status: form.quote_status,
        notas: form.notas || null,
        proposal_description: form.proposal_description || null,
        construction_cost: form.construction_cost ? Number(form.construction_cost) : null,
        fee_percentage: form.fee_percentage ? Number(form.fee_percentage) : null,
        pricing_multiplier: form.pricing_multiplier ? Number(form.pricing_multiplier) : 1,
      };
      const { error } = await supabase.from("fee_proposals").update(updates).eq("id", quoteId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("quotes.savedToast"));
      qc.invalidateQueries({ queryKey: ["fee_proposal", quoteId] });
      qc.invalidateQueries({ queryKey: ["fee_proposals_by_opp"] });
      qc.invalidateQueries({ queryKey: ["crm_opportunities"] });
      qc.invalidateQueries({ queryKey: ["crm_opportunity"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("fee_proposals").delete().eq("id", quoteId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("quotes.deletedToast"));
      if (quote?.opportunity_id) {
        navigate({ to: "/crm/opportunities/$opportunityId", params: { opportunityId: quote.opportunity_id } });
      } else {
        navigate({ to: "/crm/opportunities" });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const convert = useMutation({
    mutationFn: async () => {
      if (!quote) throw new Error(t("quotes.loadError"));
      if (quote.quote_status !== "approved") throw new Error(t("quotes.convertOnlyApproved"));
      if (quote.pm_project_id) {
        return {
          id: quote.pm_project_id,
          alreadyExisted: true,
          stagesCopied: 0,
          dependenciesCopied: 0,
          allocationsCopied: 0,
          allocationsSkipped: 0,
          externalCopied: 0,
        };
      }

      // 0. Snapshot the agreed commercial baseline BEFORE creating the
      //    project. We compute the rollup from the live quote data so the
      //    sold_fee is exactly what was approved — independent of any
      //    future changes to project allocations or rates.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [{ data: snapAllocs }, { data: snapExt }] = await Promise.all([
        db
          .from("quote_allocations")
          .select("*, resource:pm_resources(id, name, color, role)")
          .eq("quote_id", quote.id),
        db
          .from("quote_external_services")
          .select("*, supplier:pm_suppliers(id, name)")
          .eq("quote_id", quote.id),
      ]);
      const soldSummary = rollupQuote({
        allocations: snapAllocs ?? [],
        externalServices: snapExt ?? [],
        pricingMultiplier: Number(quote.pricing_multiplier ?? 1),
      });

      // 1. Create the project shell with the locked commercial baseline.
      const { data: project, error: projErr } = await supabase
        .from("pm_projects")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          name: quote.titulo,
          status: "active",
          start_date: new Date().toISOString().slice(0, 10),
          company_id: quote.company_id,
          account_id: quote.account_id,
          quote_id: quote.id,
          opportunity_id: quote.opportunity_id,
          notes: `Created from quote "${quote.titulo}"`,
          // Locked commercial baseline — DB trigger prevents future edits.
          sold_fee: soldSummary.totalFee,
          sold_internal_fee: soldSummary.internal.value * soldSummary.pricingMultiplier,
          sold_external_fee: soldSummary.external.value * soldSummary.pricingMultiplier,
          sold_pricing_multiplier: soldSummary.pricingMultiplier,
          sold_at: new Date().toISOString(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .select("id")
        .single();
      if (projErr) throw projErr;

      // 2. Copy quote_stages → pm_stages, keeping a mapping for allocations.
      const { data: qStages, error: qsErr } = await db
        .from("quote_stages")
        .select(
          "id, name, parent_stage_id, start_date, end_date, color, sort_order, budget, stage_kind, billing_model, retainer_monthly_amount, retainer_anchor_month, retainer_months, retainer_capacity_hours_per_month, retainer_review_months, is_fee_only",
        )
        .eq("quote_id", quote.id)
        .order("sort_order", { ascending: true });
      if (qsErr) throw qsErr;

      const stageIdMap = new Map<string, string>();
      // For retainer parents, remember the per-month child stage ids so the
      // allocation copy step can clamp + clone each allocation into every month.
      const retainerChildrenByParent = new Map<
        string,
        Array<{ childId: string; start: string; end: string }>
      >();
      const i18nLocale = (typeof navigator !== "undefined" && navigator.language) || "en";

      for (const s of qStages ?? []) {
        const isRetainer = s.stage_kind === "retainer_monthly";
        const anchor = s.retainer_anchor_month;
        const months = Number(s.retainer_months ?? 0);

        if (isRetainer && anchor && months > 0) {
          // Parent stage: full retainer span. No allocations live on the parent.
          const parentStart = anchorMonthStart(anchor);
          const parentEnd = anchorMonthEnd(shiftAnchor(anchor, months - 1));
          const { data: parentRow, error: parentErr } = await db
            .from("pm_stages")
            .insert({
              project_id: project.id,
              name: s.name,
              start_date: parentStart,
              end_date: parentEnd,
              color: s.color ?? "#22c55e",
              sort_order: s.sort_order ?? 0,
              budget: Number(s.budget ?? 0),
              stage_kind: "retainer_monthly",
              billing_model: s.billing_model ?? "stage",
              retainer_monthly_amount: Number(s.retainer_monthly_amount ?? 0),
              retainer_anchor_month: anchor,
              retainer_months: months,
              retainer_capacity_hours_per_month:
                s.retainer_capacity_hours_per_month ?? 160,
              retainer_review_months: s.retainer_review_months ?? null,
              is_fee_only: s.is_fee_only ?? true,
            })
            .select("id")
            .single();
          if (parentErr) throw parentErr;
          stageIdMap.set(s.id, parentRow.id);

          const monthlyAmount = Number(s.retainer_monthly_amount ?? 0);
          const children: Array<{ childId: string; start: string; end: string }> = [];
          for (let i = 0; i < months; i++) {
            const monthAnchor = shiftAnchor(anchor, i);
            const childStart = anchorMonthStart(monthAnchor);
            const childEnd = anchorMonthEnd(monthAnchor);
            const monthLabel = formatAnchorMonth(monthAnchor, i18nLocale);
            const { data: childRow, error: childErr } = await db
              .from("pm_stages")
              .insert({
                project_id: project.id,
                parent_stage_id: parentRow.id,
                name: `${monthLabel} — ${s.name}`,
                start_date: childStart,
                end_date: childEnd,
                color: s.color ?? "#22c55e",
                sort_order: (s.sort_order ?? 0) * 1000 + i + 1,
                budget: monthlyAmount,
                stage_kind: "retainer_month",
                billing_model: "stage",
                retainer_monthly_amount: 0,
                retainer_anchor_month: null,
                retainer_months: null,
                retainer_capacity_hours_per_month:
                  s.retainer_capacity_hours_per_month ?? 160,
                retainer_review_months: null,
                is_fee_only: s.is_fee_only ?? true,
              })
              .select("id")
              .single();
            if (childErr) throw childErr;
            children.push({ childId: childRow.id, start: childStart, end: childEnd });
          }
          retainerChildrenByParent.set(s.id, children);
        } else {
          const { data: created, error: insErr } = await db
            .from("pm_stages")
            .insert({
              project_id: project.id,
              name: s.name,
              start_date: s.start_date,
              end_date: s.end_date,
              color: s.color ?? "#22c55e",
              sort_order: s.sort_order ?? 0,
              budget: Number(s.budget ?? 0),
              stage_kind: s.stage_kind ?? "regular",
              billing_model: s.billing_model ?? "stage",
              retainer_monthly_amount: Number(s.retainer_monthly_amount ?? 0),
              retainer_anchor_month: s.retainer_anchor_month ?? null,
              retainer_months: s.retainer_months ?? null,
              retainer_capacity_hours_per_month:
                s.retainer_capacity_hours_per_month ?? 160,
              retainer_review_months: s.retainer_review_months ?? null,
              is_fee_only: s.is_fee_only ?? true,
            })
            .select("id")
            .single();
          if (insErr) throw insErr;
          stageIdMap.set(s.id, created.id);
        }
      }
      const stagesCopied = stageIdMap.size;

      // 2b. Copy quote_stage_dependencies → pm_stage_dependencies, remapping
      //     predecessor/successor IDs through stageIdMap. Skip silently if
      //     either endpoint is missing (defensive — schema FKs prevent it).
      let dependenciesCopied = 0;
      const { data: qDeps, error: qdErr } = await db
        .from("quote_stage_dependencies")
        .select("predecessor_stage_id, successor_stage_id, type, lag_days")
        .eq("quote_id", quote.id);
      if (qdErr) throw qdErr;
      for (const d of qDeps ?? []) {
        const pred = stageIdMap.get(d.predecessor_stage_id);
        const succ = stageIdMap.get(d.successor_stage_id);
        if (!pred || !succ) continue;
        const { error: dErr } = await db.from("pm_stage_dependencies").insert({
          predecessor_id: pred,
          successor_id: succ,
          type: d.type ?? "FS",
          lag_days: Number(d.lag_days ?? 0),
        });
        if (dErr) throw dErr;
        dependenciesCopied += 1;
      }

      // 3. Copy quote_allocations → pm_allocations (committed status).
      //    Retainer parents have their allocations expanded into per-month
      //    children — each child gets a clone with start/end clamped to that
      //    month so timesheet entries roll up cleanly per month.
      const { data: qAllocs, error: qaErr } = await db
        .from("quote_allocations")
        .select("stage_id, resource_id, start_date, end_date, hours_per_day")
        .eq("quote_id", quote.id);
      if (qaErr) throw qaErr;

      let allocationsCopied = 0;
      let allocationsSkipped = 0;
      for (const a of qAllocs ?? []) {
        const children = retainerChildrenByParent.get(a.stage_id);
        if (children && children.length > 0) {
          // Expand the retainer-template allocation across every month.
          for (const ch of children) {
            const cs = parseISO(ch.start);
            const ce = parseISO(ch.end);
            const as = parseISO(a.start_date);
            const ae = parseISO(a.end_date);
            const clampedStart = maxDate([cs, as]);
            const clampedEnd = minDate([ce, ae]);
            if (clampedStart > clampedEnd) continue;
            const { error: aErr } = await db.from("pm_allocations").insert({
              stage_id: ch.childId,
              resource_id: a.resource_id,
              start_date: fmtDate(clampedStart, "yyyy-MM-dd"),
              end_date: fmtDate(clampedEnd, "yyyy-MM-dd"),
              hours_per_day: Number(a.hours_per_day ?? 8),
              status: "committed",
            });
            if (aErr) throw aErr;
            allocationsCopied += 1;
          }
          continue;
        }
        const newStageId = stageIdMap.get(a.stage_id);
        if (!newStageId) {
          allocationsSkipped += 1;
          // eslint-disable-next-line no-console
          console.warn("Quote→Project conversion: skipped allocation with missing stage", a);
          continue;
        }
        const { error: aErr } = await db.from("pm_allocations").insert({
          stage_id: newStageId,
          resource_id: a.resource_id,
          start_date: a.start_date,
          end_date: a.end_date,
          hours_per_day: Number(a.hours_per_day ?? 8),
          status: "committed",
        });
        if (aErr) throw aErr;
        allocationsCopied += 1;
      }

      // 4. Copy quote_external_services → pm_materials.
      const { data: qExt, error: qeErr } = await db
        .from("quote_external_services")
        .select(
          "description, supplier_id, quantity, unit_cost, purchase_price, markup_type, markup_value, sale_price, sale_price_manual, status, notes",
        )
        .eq("quote_id", quote.id);
      if (qeErr) throw qeErr;

      let externalCopied = 0;
      for (const e of qExt ?? []) {
        const { error: mErr } = await db.from("pm_materials").insert({
          project_id: project.id,
          description: e.description,
          supplier_id: e.supplier_id,
          quantity: Number(e.quantity ?? 1),
          unit_cost: Number(e.unit_cost ?? 0),
          purchase_price: Number(e.purchase_price ?? 0),
          markup_type: e.markup_type ?? "percent",
          markup_value: Number(e.markup_value ?? 0),
          sale_price: Number(e.sale_price ?? 0),
          sale_price_manual: !!e.sale_price_manual,
          status: e.status ?? "draft",
          notes: e.notes,
        });
        if (mErr) throw mErr;
        externalCopied += 1;
      }

      // 4b. Write the immutable contract baseline snapshot (for internal
      //     reference). This captures what was agreed at conversion time;
      //     subsequent edits happen on pm_* tables.
      const { data: baselineRow, error: baselineErr } = await db
        .from("pm_project_contract_baseline")
        .insert({
          project_id: project.id,
          quote_id: quote.id,
          total_fee: soldSummary.totalFee,
          total_internal_fee: soldSummary.internal.value * soldSummary.pricingMultiplier,
          total_external_fee: soldSummary.external.value * soldSummary.pricingMultiplier,
          pricing_multiplier: soldSummary.pricingMultiplier,
          quote_title: quote.titulo,
          quote_number: (quote as { proposal_number?: string | null }).proposal_number ?? null,
        })
        .select("id")
        .single();
      if (baselineErr) throw baselineErr;

      if (qStages && qStages.length > 0) {
        const stageNameById = new Map<string, string>(
          qStages.map((s: { id: string; name: string }) => [s.id, s.name]),
        );
        const baselineStageRows = (qStages as Array<{ name: string; parent_id: string | null; start_date: string; end_date: string; budget: number | null; billing_model: string | null; stage_kind: string | null; sort_order: number | null }>).map((s, i) => ({
          baseline_id: baselineRow.id,
          name: s.name,
          parent_name: s.parent_id ? (stageNameById.get(s.parent_id) ?? null) : null,
          start_date: s.start_date,
          end_date: s.end_date,
          budget: Number(s.budget ?? 0),
          billing_model: s.billing_model ?? null,
          stage_kind: s.stage_kind ?? null,
          sort_order: s.sort_order ?? i,
        }));
        const { error: bsErr } = await db
          .from("pm_project_contract_baseline_stages")
          .insert(baselineStageRows);
        if (bsErr) throw bsErr;

        const { data: qPayments } = await db
          .from("quote_payment_schedule_items")
          .select("label, trigger_type, amount_value, expected_invoice_date, expected_payment_date, stage_id, sort_order")
          .eq("quote_id", quote.id)
          .order("sort_order", { ascending: true });
        if (qPayments && qPayments.length > 0) {
          const baselinePaymentRows = qPayments.map((p: {
            label: string; trigger_type: string | null; amount_value: number | null;
            expected_invoice_date: string | null; expected_payment_date: string | null;
            stage_id: string | null; sort_order: number | null;
          }, i: number) => ({
            baseline_id: baselineRow.id,
            label: p.label,
            trigger_type: p.trigger_type,
            amount: Number(p.amount_value ?? 0),
            expected_invoice_date: p.expected_invoice_date,
            expected_payment_date: p.expected_payment_date,
            stage_name: p.stage_id ? (stageNameById.get(p.stage_id) ?? null) : null,
            sort_order: p.sort_order ?? i,
          }));
          const { error: bpErr } = await db
            .from("pm_project_contract_baseline_payments")
            .insert(baselinePaymentRows);
          if (bpErr) throw bpErr;
        }
      }

      // 4c. Copy live editable payment schedule → pm_payment_schedule_items.
      //     Stage IDs are remapped through stageIdMap. For retainer parents
      //     that exploded into per-month children, we point the copy to the
      //     parent's pm_stages row (the parent ID is also in stageIdMap).
      //     invoice_group_id is regenerated per old-group so grouping stays
      //     intact on the project side without colliding with quote ids.
      const { data: qPaymentsLive } = await db
        .from("quote_payment_schedule_items")
        .select("*")
        .eq("quote_id", quote.id)
        .order("sort_order", { ascending: true });
      const groupIdMap = new Map<string, string>();
      const itemIdMap = new Map<string, string>();
      // Two-pass: insert first (linked_payment_item_id NULL), then patch links.
      if (qPaymentsLive && qPaymentsLive.length > 0) {
        for (const p of qPaymentsLive as Array<Record<string, unknown>>) {
          let newGroup: string | null = null;
          if (p.invoice_group_id) {
            const key = String(p.invoice_group_id);
            newGroup = groupIdMap.get(key) ?? crypto.randomUUID();
            groupIdMap.set(key, newGroup);
          }
          const mappedStage = p.stage_id ? (stageIdMap.get(String(p.stage_id)) ?? null) : null;
          const { data: inserted, error: insErr } = await db
            .from("pm_payment_schedule_items")
            .insert({
              project_id: project.id,
              stage_id: mappedStage,
              label: p.label,
              trigger_type: p.trigger_type,
              amount_type: p.amount_type,
              amount_value: Number(p.amount_value ?? 0),
              expected_invoice_date: p.expected_invoice_date ?? null,
              expected_payment_date: p.expected_payment_date ?? null,
              sort_order: p.sort_order ?? 0,
              notes: p.notes ?? null,
              manual_override: !!p.manual_override,
              generator_source: p.generator_source ?? null,
              direction: p.direction ?? "inflow",
              supplier_company_id: p.supplier_company_id ?? null,
              payment_offset_days: p.payment_offset_days ?? 0,
              vat_rate: Number(p.vat_rate ?? 23),
              vat_rate_override: !!p.vat_rate_override,
              payment_terms: p.payment_terms ?? null,
              supplier_id: p.supplier_id ?? null,
              supplier_label: p.supplier_label ?? null,
              invoice_group_id: newGroup,
              billing_status: p.billing_status ?? "planned",
              source_quote_payment_item_id: p.id,
            })
            .select("id")
            .single();
          if (insErr) throw insErr;
          itemIdMap.set(String(p.id), String(inserted.id));
        }
        // Patch linked_payment_item_id second pass
        for (const p of qPaymentsLive as Array<Record<string, unknown>>) {
          if (!p.linked_payment_item_id) continue;
          const newId = itemIdMap.get(String(p.id));
          const newLink = itemIdMap.get(String(p.linked_payment_item_id));
          if (!newId || !newLink) continue;
          await db
            .from("pm_payment_schedule_items")
            .update({ linked_payment_item_id: newLink })
            .eq("id", newId);
        }
      }


      // 5. Link the project back to the quote and mark opportunity as won.
      const { error: linkErr } = await supabase
        .from("fee_proposals")
        .update({ pm_project_id: project.id })
        .eq("id", quote.id);
      if (linkErr) throw linkErr;

      if (quote.opportunity_id) {
        await supabase.from("crm_opportunities").update({ stage: "won" }).eq("id", quote.opportunity_id);
      }
      return {
        id: project.id,
        alreadyExisted: false,
        stagesCopied,
        dependenciesCopied,
        allocationsCopied,
        allocationsSkipped,
        externalCopied,
      };
    },
    onSuccess: (res) => {
      if (res.alreadyExisted) {
        toast.success(t("quotes.convertExisting"));
      } else {
        toast.success(
          t("quotes.convertSummary", {
            stages: res.stagesCopied,
            allocations: res.allocationsCopied,
            external: res.externalCopied,
            dependencies: res.dependenciesCopied,
          }),
        );
        if (res.allocationsSkipped > 0) {
          toast.warning(
            t("quotes.convertSkipped", { count: res.allocationsSkipped }),
          );
        }
      }
      qc.invalidateQueries({ queryKey: ["fee_proposal", quoteId] });
      qc.invalidateQueries({ queryKey: ["crm_opportunity"] });
      // Land on the allocations page so the PM can assign resources to
      // stages right after activation. They can skip and do it later by
      // navigating to the project overview.
      if (res.alreadyExisted) {
        navigate({ to: "/projects/$projectId", params: { projectId: res.id } });
      } else {
        navigate({ to: "/projects/$projectId/allocations", params: { projectId: res.id } });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Convert prompt is owned by React state (AlertDialog), not by the
  // browser's native confirm(). This guarantees the prompt is only shown
  // when the user clicks the dedicated Convert button — never as a
  // side-effect of approving or any other status transition.
  const [convertOpen, setConvertOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);

  const handleConvert = () => {
    if (!quote) return;
    if (quote.pm_project_id) {
      // Already exists — go straight to it without a confirm prompt.
      convert.mutate();
      return;
    }
    setConvertOpen(true);
  };

  // Loaders used for stepper completion ticks and (historically) the
  // pre-conversion warnings banner. The banner now lives in the Publish
  // step only, so we keep the queries (cheap, cached) but no longer
  // compute warnings inline.
  // Hooks must run before any early return: never gate them on `quote`.
  const stagesQ = useQuoteStages(quoteId);
  const allocsQ = useQuoteAllocations(quoteId);
  const externalQ = useQuoteExternalServices(quoteId);
  const paymentQ = useQuotePaymentSchedule(quoteId);
  void rollupQuote; // keep import — used by conversion mutation above


  // Linear workflow state — orchestration only. All underlying tabs and
  // components below are preserved unchanged; the stepper just filters
  // which secondary tabs are surfaced per step.
  const [step, setStep] = useState<QuoteStep>("estimate");
  const [activeTab, setActiveTab] = useState<string>("overview");

  // Sync the active tab whenever the workflow step changes so the visible
  // tab triggers and the rendered TabsContent stay consistent. Without
  // this, switching to "content" leaves the Tabs root on "overview" — a
  // hidden trigger — and nothing renders.
  const projectCategory = normalizeQuoteCategory(quote?.quote_category);
  const stepIsProject = projectCategory === "project";
  useEffect(() => {
    if (step === "estimate") {
      setActiveTab(stepIsProject ? "overview" : "overview");
    } else if (step === "content") {
      setActiveTab("proposal");
    }
  }, [step, stepIsProject]);


  if (isLoading) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (!quote) return <p className="text-sm text-muted-foreground">{t("common.notFound")}</p>;

  const status = QUOTE_STATUSES.find((s) => s.value === quote.quote_status);
  // canConvert lives on QuoteWorkflowActions in the header now.
  const pricingMultiplier = Number(form.pricing_multiplier) || 1;
  const category = normalizeQuoteCategory(quote.quote_category);
  const isProject = category === "project";
  // Phase 1 lock — set by DB trigger when status=approved + project linked.
  const lockMeta = quote as unknown as { is_locked?: boolean; locked_project_id?: string | null };
  const isLocked = !!lockMeta.is_locked;
  const lockedProjectId = lockMeta.locked_project_id ?? null;

  // Soft completion signals for the stepper. Non-blocking — these only
  // drive the visual tick on each step.
  const stagesCount = stagesQ.data?.length ?? 0;
  const allocationsCount = allocsQ.data?.length ?? 0;
  const paymentCount = paymentQ.data?.length ?? 0;
  const hasProposalContent =
    !!(form.proposal_description?.trim() || quote.proposal_description?.trim());
  const completion = {
    estimate: isProject ? stagesCount > 0 : allocationsCount > 0,
    content: hasProposalContent,
    publish: !!quote.pm_project_id,
  } as const;

  // Per-step visible secondary tabs. All TabsContent below remain mounted
  // in the DOM (Radix Tabs only renders the active one); we just hide the
  // triggers that are not part of the current step.
  // Project quotes no longer expose the "Tempo" tab — proposal type is set
  // at quote-creation time and cannot be switched from within a Standard
  // Project workspace. The two time-based proposal types keep the tab as
  // their primary fee configuration surface. Phase-level retainer billing
  // is intentionally deferred and is NOT a proposal-type switch.
  // Retainer quotes never bill external services and never use stage milestones.
  // They keep Planning (monthly template editor) and Payment (auto-generated
  // monthly schedule) but drop the External Services and generator clutter.
  const isRetainer = category === "retainer";
  const estimateTabs = isRetainer
    ? ["overview", "planning", "payment", "financial"]
    : isProject
      ? ["overview", "planning", "external", "payment", "financial"]
      : ["overview", "time-based", "financial"];
  const contentTabs = ["proposal"];
  const visibleTabs =
    step === "estimate"
      ? estimateTabs
      : step === "content"
        ? contentTabs
        : [];

  return (
    <div className="space-y-6">
      {quote.opportunity ? (
        <Link to="/crm/opportunities/$opportunityId" params={{ opportunityId: quote.opportunity.id }}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> {t("quotes.backToOpportunity")}
        </Link>
      ) : (
        <Link to="/crm/opportunities"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> {t("quotes.backToOpportunities")}
        </Link>
      )}

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <InlineEditableTitle
            value={quote.titulo}
            onSave={async (titulo: string) => {
              const { error } = await supabase
                .from("fee_proposals")
                .update({ titulo })
                .eq("id", quoteId);
              if (error) throw error;
              setForm((f) => ({ ...f, titulo }));
              qc.invalidateQueries({ queryKey: ["fee_proposal", quoteId] });
              qc.invalidateQueries({ queryKey: ["fee_proposals_by_opp"] });
            }}
            className="text-2xl font-semibold tracking-tight"
          />
          <p className="text-sm text-muted-foreground">
            {quote.company?.nome ?? "—"}
            {quote.opportunity && (
              <>{" · "}
                <Link to="/crm/opportunities/$opportunityId"
                  params={{ opportunityId: quote.opportunity.id }} className="hover:underline">
                  {quote.opportunity.name}
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
            <span className={`h-2 w-2 rounded-full ${status?.color}`} />
            {status ? t(`quoteStatus.${status.value}`) : ""}
          </span>
          <QuoteWorkflowActions
            quoteId={quoteId}
            status={quote.quote_status}
            hasAccount={!!quote.account_id}
            hasProject={!!quote.pm_project_id}
            companyId={quote.company_id ?? null}
            defaultContactId={quote.contact_id ?? null}
            onConvert={handleConvert}
            isConverting={convert.isPending}
          />
          <Button variant="outline" size="sm" onClick={() => setSaveTemplateOpen(true)}>
            {t("templates.actions.saveAs")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLocked && (
        <QuoteLockBanner
          projectId={quote.pm_project_id ?? lockedProjectId}
          projectName={null}
          isAdmin={isAdmin}
        />
      )}

      <fieldset disabled={isLocked && !isAdmin} className="contents">

      <QuoteWorkflowStepper
        step={step}
        onChange={setStep}
        completion={completion}
      />

      {step === "publish" && (
        <QuotePublishStep
          quoteId={quoteId}
          estimateReady={completion.estimate}
          contentReady={completion.content}
          paymentReady={paymentCount > 0}
          hasProject={!!quote.pm_project_id}
          projectId={quote.pm_project_id ?? null}
          pricingMultiplier={pricingMultiplier}
          title={form.titulo || quote.titulo}
          description={form.proposal_description || quote.proposal_description || quote.notas}
          clientName={quote.company?.nome ?? null}
          accountName={quote.account?.name ?? null}
          quoteType={quote.quote_type ?? "standard_project"}
          quoteCategory={quote.quote_category}
          ontologyFamilyCode={(quote as unknown as { ontology_family_code?: string | null }).ontology_family_code ?? null}
          quoteStatus={quote.quote_status}
          onConvert={handleConvert}
          isConverting={convert.isPending}
          onEditEstimate={() => setStep("estimate")}
          onEditContent={() => setStep("content")}
        />
      )}

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className={cn("w-full", step === "publish" && "hidden")}
      >
        <TabsList className="no-print">
          {visibleTabs.includes("overview") && (
            <TabsTrigger value="overview">{t("workspace.tabs.overview")}</TabsTrigger>
          )}
          {/* Time-based tab is always shown — for project quotes the optional
              retainer/consultancy add-on figures live there, and for
              consultancy quotes it is the primary fee configuration tab. */}
          {visibleTabs.includes("time-based") && (
            <TabsTrigger value="time-based">{t("workspace.tabs.timeBased")}</TabsTrigger>
          )}
          {/* Planning (Gantt + stages), External services and Payment schedule
              are project-only — consultancy proposals do not have stages,
              dependencies or stage-driven payment milestones. */}
          {(isProject || isRetainer) && visibleTabs.includes("planning") && (
            <TabsTrigger value="planning">{t("workspace.tabs.planning")}</TabsTrigger>
          )}


          {(isProject || isRetainer) && visibleTabs.includes("payment") && (
            <TabsTrigger value="payment">{t("workspace.tabs.payment")}</TabsTrigger>
          )}
          {visibleTabs.includes("financial") && (
            <TabsTrigger value="financial">{t("workspace.tabs.financial")}</TabsTrigger>
          )}
          {visibleTabs.includes("proposal") && (
            <TabsTrigger value="proposal">{t("workspace.tabs.proposal")}</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          {isProject && (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-base">
                  {t("workspace.overview.calculatorIntroTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {t("workspace.overview.calculatorIntroHint")}
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">{t("quotes.feeDetails")}</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>{t("common.title")}</Label>
                <Input value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} />
              </div>
              <div>
                <Label>{t("common.estimatedFee")}</Label>
                <Input type="number" step="0.01" value={form.valor}
                  onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))} />
              </div>
              <div>
                <Label>{t("common.feeStructure")}</Label>
                <Select value={form.fee_structure_type}
                  onValueChange={(v) => setForm((f) => ({ ...f, fee_structure_type: v as FeeStructureType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FEE_STRUCTURE_TYPES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{t(`feeStructure.${s.value}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Construction cost / fee percentage are project-quote
                  concepts (% of construction value). Hidden for
                  consultancy quotes which bill hourly. */}
              {isProject && (
                <>
                  <div>
                    <Label>{t("workspace.overview.constructionCost")}</Label>
                    <Input type="number" step="0.01" value={form.construction_cost}
                      onChange={(e) => setForm((f) => ({ ...f, construction_cost: e.target.value }))} />
                  </div>
                  <div>
                    <Label>{t("workspace.overview.feePercentage")}</Label>
                    <Input type="number" step="0.01" value={form.fee_percentage}
                      onChange={(e) => setForm((f) => ({ ...f, fee_percentage: e.target.value }))} />
                  </div>
                </>
              )}
              <div>
                <Label>{t("workspace.overview.pricingMultiplier")}</Label>
                <Input type="number" step="0.01" value={form.pricing_multiplier}
                  onChange={(e) => setForm((f) => ({ ...f, pricing_multiplier: e.target.value }))} />
              </div>
              {/* Non-project quotes keep account/status/description/notes
                  on this tab — they have no calculator and this is still
                  their main metadata surface. For project quotes those
                  fields live in the quote header (status), Publish step
                  (account/conversion), Step 2 Content (description) and
                  the activity stream (notes). */}
              {!isProject && (
                <>
                  <div>
                    <Label>{t("common.account")}</Label>
                    <Select value={form.account_id || "none"}
                      onValueChange={(v) => setForm((f) => ({ ...f, account_id: v === "none" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder={t("common.noAccount")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("common.noAccount")}</SelectItem>
                        {accounts.map((a) => (<SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t("common.status")}</Label>
                    <Select value={form.quote_status}
                      onValueChange={(v) => setForm((f) => ({ ...f, quote_status: v as QuoteStatus }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {QUOTE_STATUSES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {t(`quoteStatus.${s.value}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <Label>{t("workspace.overview.proposalDescription")}</Label>
                    <Textarea rows={4} value={form.proposal_description}
                      onChange={(e) => setForm((f) => ({ ...f, proposal_description: e.target.value }))} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>{t("common.notes")}</Label>
                    <Textarea rows={3} value={form.notas}
                      onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} />
                  </div>
                </>
              )}
              <div className="sm:col-span-2 flex justify-end">
                <Button onClick={() => save.mutate()} disabled={save.isPending}>{t("common.save")}</Button>
              </div>
            </CardContent>
          </Card>

          {/* Construction-percentage architectural fee calculator. Project
              Proposals only — Consultancy quotes bill hourly and skip this.
              The conversion-to-project card was intentionally removed from
              this tab: conversion lives in the quote header (workflow
              actions) and the Publish step, so it cannot compete visually
              with the calculator. */}
          {isProject && (
            <div className="mt-4">
              <QuoteFeeCalculatorCard
                quoteId={quoteId}
                initialPayload={quote.project_fee_calculation}
                onApplied={(finalFee, constructionValue, feePct) => {
                  setForm((f) => ({
                    ...f,
                    valor: String(Math.round(finalFee * 100) / 100),
                    construction_cost: constructionValue ? String(constructionValue) : "",
                    fee_percentage: feePct ? String(Number(feePct.toFixed(4))) : "",
                  }));
                }}
              />
            </div>
          )}

          {/* Ontology bootstrap — intelligent defaults for stages, dependencies
              and payment schedule. Sits beneath the calculator so the user
              flow stays: 1) compute fee → 2) generate planning skeleton.
              Manual edits on existing rows are always preserved. */}
          {isProject && (
            <div className="mt-4">
              <QuoteOntologyBootstrapCard
                quoteId={quoteId}
                initialFamilyCode={(quote as unknown as { ontology_family_code?: string | null }).ontology_family_code ?? null}
                initialPresetCode={(quote as unknown as { ontology_preset_code?: string | null }).ontology_preset_code ?? null}
                initialDeliveryMode={(quote as unknown as { ontology_delivery_mode?: string | null }).ontology_delivery_mode ?? null}
                initialBootstrappedAt={(quote as unknown as { ontology_bootstrapped_at?: string | null }).ontology_bootstrapped_at ?? null}
              />
            </div>
          )}

          <div className="mt-4">
            <QuoteCreateContractCard quoteId={quoteId} quoteStatus={quote.quote_status} />
          </div>
        </TabsContent>



        {!isProject && (
          <TabsContent value="time-based" className="mt-4">
            <QuoteTimeBasedSettingsTab
              quoteId={quoteId}
              quoteType={quote.quote_type}
              quoteCategory={quote.quote_category}
            />
          </TabsContent>
        )}
        {(isProject || isRetainer) && (
          <>
            <TabsContent value="planning" className="mt-4">
              <QuotePlanningTab quoteId={quoteId} pricingMultiplier={pricingMultiplier} isRetainer={isRetainer} />
            </TabsContent>


            <TabsContent value="payment" className="mt-4">
              <QuotePaymentScheduleTab quoteId={quoteId} />
            </TabsContent>
          </>
        )}
        <TabsContent value="financial" className="mt-4">
          <QuoteFinancialSummaryTab quoteId={quoteId} pricingMultiplier={pricingMultiplier} />
        </TabsContent>
        <TabsContent value="proposal" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <ApplyTemplateDialog
              quoteId={quoteId}
              category={quote.quote_category ?? "project"}
            />
          </div>
          <QuoteProposalTab
            quoteId={quoteId}
            pricingMultiplier={pricingMultiplier}
            title={form.titulo || quote.titulo}
            description={form.proposal_description || quote.proposal_description || quote.notas}
            clientName={quote.company?.nome ?? null}
            accountName={quote.account?.name ?? null}
            quoteType={quote.quote_type ?? "standard_project"}
            quoteCategory={quote.quote_category}
            ontologyFamilyCode={(quote as unknown as { ontology_family_code?: string | null }).ontology_family_code ?? null}
          />
        </TabsContent>
      </Tabs>

      </fieldset>

      {/* Convert dialog — owned exclusively by the dedicated Convert
          button. Cannot be triggered as a side-effect of approval. */}
      <AlertDialog open={convertOpen} onOpenChange={setConvertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("quotes.convertDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("quotes.convertDialog.description")}
              {!quote.account_id && (
                <span className="block mt-2 text-amber-600 dark:text-amber-400">
                  {t("quotes.convertNoAccountWarning")}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConvertOpen(false);
                convert.mutate();
              }}
            >
              {t("quotes.convertDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("quotes.deleteDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("quotes.deleteDialog.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDeleteOpen(false);
                remove.mutate();
              }}
            >
              {t("quotes.deleteDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SaveAsTemplateDialog
        open={saveTemplateOpen}
        onClose={() => setSaveTemplateOpen(false)}
        quoteId={quoteId}
        defaultName={quote.titulo}
        defaultCategory={category}
      />
    </div>
  );
}
