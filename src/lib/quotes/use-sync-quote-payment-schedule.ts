import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rollupQuote } from "./financial-rollups";
import {
  applyPaymentDefaults,
  computeStageFees,
  DEFAULT_STAGE_MILESTONE_OPTIONS,
  generateByStageBilling,
  type PaymentDefaults,
} from "./payment-generators";
import { rolledUpBillableFees } from "./stage-billing";
import { useQuoteAllocations } from "./use-quote-allocations";
import {
  useQuoteExternalServices,
  type QuoteExternalServiceWithSupplier,
} from "./use-quote-external-services";
import { useApplyPaymentGenerator } from "./use-quote-payment-schedule";
import { useQuoteStages } from "./use-quote-stages";
import type { QuoteStage } from "./types";

type SupplierStage = QuoteStage & {
  parent_stage_id?: string | null;
  supplier_id?: string | null;
  supplier_placeholder?: string | null;
  is_self?: boolean | null;
  supplier_company_id?: string | null;
  budget?: number | null;
  budget_mode?: string | null;
};

type InheritedSupplier =
  | { kind: "self" }
  | { kind: "supplier"; supplierId: string }
  | { kind: "company"; companyId: string }
  | { kind: "placeholder"; label: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useSyncQuotePaymentScheduleFromGantt(quoteId: string) {
  const { t } = useTranslation("crm");
  const stagesQ = useQuoteStages(quoteId);
  const allocationsQ = useQuoteAllocations(quoteId);
  const externalsQ = useQuoteExternalServices(quoteId);
  const applyGen = useApplyPaymentGenerator(quoteId);

  const quoteQ = useQuery({
    queryKey: ["fee-proposal-summary", quoteId],
    enabled: !!quoteId,
    queryFn: async () => {
      const { data, error } = await db
        .from("fee_proposals")
        .select("pricing_multiplier,valor,quote_category,default_vat_rate,default_payment_terms,first_payment_terms,fee_source_mode")
        .eq("id", quoteId)
        .single();
      if (error) throw new Error(error.message);
      return data as {
        pricing_multiplier: number | null;
        valor: number | null;
        quote_category: string | null;
        default_vat_rate: number | null;
        default_payment_terms: string | null;
        first_payment_terms: string | null;
        fee_source_mode: string | null;
      };
    },
  });

  // Optional stages (and their descendants) are quoted separately as
  // "Optional Services" and MUST NOT appear in the generated payment
  // schedule — excluding them here keeps them out of every downstream
  // calculation (rollup, stage fees, external outflows, generator).
  const allStages = stagesQ.data ?? [];
  const optionalById = new Map(allStages.map((s) => [s.id, s]));
  const inheritedOptional = (s: QuoteStage): boolean => {
    const seen = new Set<string>();
    let cur: (QuoteStage & { parent_stage_id?: string | null; is_optional?: boolean }) | undefined = s;
    while (cur && !seen.has(cur.id)) {
      if ((cur as { is_optional?: boolean }).is_optional) return true;
      seen.add(cur.id);
      const pid = (cur as { parent_stage_id?: string | null }).parent_stage_id ?? null;
      cur = pid ? (optionalById.get(pid) as typeof cur) : undefined;
    }
    return false;
  };
  const stages = allStages.filter((s) => !inheritedOptional(s));
  const optionalStageIds = new Set(allStages.filter(inheritedOptional).map((s) => s.id));
  const allocations = (allocationsQ.data ?? []).filter((a) => !optionalStageIds.has(a.stage_id));
  const externals = (externalsQ.data ?? []).filter((e) => !e.stage_id || !optionalStageIds.has(e.stage_id));

  const stageSupplierIds = Array.from(
    new Set(
      (stages as SupplierStage[])
        .map((s) => s.supplier_id)
        .filter((x): x is string => !!x),
    ),
  );
  const stageCompanyIds = Array.from(
    new Set(
      (stages as SupplierStage[])
        .map((s) => s.supplier_company_id)
        .filter((x): x is string => !!x),
    ),
  );

  const stageSuppliersQ = useQuery({
    queryKey: ["stage-pm-suppliers", quoteId, [...stageSupplierIds].sort().join(",")],
    enabled: stageSupplierIds.length > 0,
    queryFn: async () => {
      const { data, error } = await db
        .from("pm_suppliers")
        .select("id,name")
        .in("id", stageSupplierIds);
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const stageCompaniesQ = useQuery({
    queryKey: ["stage-companies", quoteId, [...stageCompanyIds].sort().join(",")],
    enabled: stageCompanyIds.length > 0,
    queryFn: async () => {
      const { data, error } = await db
        .from("companies")
        .select("id,nome")
        .in("id", stageCompanyIds);
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; nome: string }[];
    },
  });

  const supplierLookupReady =
    (stageSupplierIds.length === 0 || stageSuppliersQ.isSuccess) &&
    (stageCompanyIds.length === 0 || stageCompaniesQ.isSuccess);

  const syncFromGantt = async () => {
    if (stages.length === 0) {
      toast.error(t("workspace.payment.generatorEmpty"));
      return;
    }
    if (!supplierLookupReady) return;

    try {
      const pricingMultiplier = Number(quoteQ.data?.pricing_multiplier ?? 1) || 1;
      const feeSourceMode: "allocation" | "budget" =
        quoteQ.data?.fee_source_mode === "budget" ? "budget" : "allocation";
      const paymentDefaults: PaymentDefaults = {
        vatRate: Number(quoteQ.data?.default_vat_rate ?? 23) || 23,
        defaultTerms: quoteQ.data?.default_payment_terms ?? "30 (trinta) dias de calendário",
        firstPaymentTerms: quoteQ.data?.first_payment_terms ?? "Pronto pagamento",
      };
      const rollup = rollupQuote({
        allocations,
        externalServices: externals,
        pricingMultiplier,
        category:
          (quoteQ.data?.quote_category as "project" | "time_based" | "retainer" | "consultancy" | undefined) ??
          undefined,
        feeSourceMode,
        stages,
      });
      const totalFee = rollup.totalFee || Number(quoteQ.data?.valor ?? 0) || 0;
      const leafStageFees = computeStageFees(
        stages,
        allocations,
        externals,
        pricingMultiplier,
        feeSourceMode,
      );
      const topLevelStageFees = rolledUpBillableFees(stages, leafStageFees);
      const stageFees = { ...leafStageFees, ...topLevelStageFees };
      const contractTotal = Object.values(topLevelStageFees).reduce((sum, value) => sum + value, 0) || totalFee;
      void contractTotal;

      const effectiveExternals = [
        ...externals,
        ...buildStageOnlyOutflows({
          quoteId,
          stages: stages as SupplierStage[],
          externals,
          stageFees,
          stageSupplierNames: stageSuppliersQ.data ?? [],
          stageCompanyNames: stageCompaniesQ.data ?? [],
        }),
      ];

      const generated = applyPaymentDefaults(
        generateByStageBilling(stages, stageFees, {
          downPaymentPercent: DEFAULT_STAGE_MILESTONE_OPTIONS.downPaymentEnabled
            ? DEFAULT_STAGE_MILESTONE_OPTIONS.downPaymentPercent
            : 0,
          deductDownPaymentFromStages: DEFAULT_STAGE_MILESTONE_OPTIONS.deductDownPaymentFromStages,
          externalServices: effectiveExternals,
          paymentOffsetDays: 30,
        }),
        paymentDefaults,
      );

      if (generated.length === 0) {
        toast.error(t("workspace.payment.generatorEmpty"));
        return;
      }

      await applyGen.mutateAsync({
        generator: "by_stage_billing",
        items: generated,
        replaceAll: true,
      });
      toast.success(t("workspace.payment.synced"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return {
    syncFromGantt,
    isPending: applyGen.isPending,
    disabled:
      applyGen.isPending ||
      quoteQ.isLoading ||
      stagesQ.isLoading ||
      allocationsQ.isLoading ||
      externalsQ.isLoading ||
      !supplierLookupReady ||
      stages.length === 0,
  };
}

function buildStageOnlyOutflows({
  quoteId,
  stages,
  externals,
  stageFees,
  stageSupplierNames,
  stageCompanyNames,
}: {
  quoteId: string;
  stages: SupplierStage[];
  externals: QuoteExternalServiceWithSupplier[];
  stageFees: Record<string, number>;
  stageSupplierNames: { id: string; name: string }[];
  stageCompanyNames: { id: string; nome: string }[];
}): QuoteExternalServiceWithSupplier[] {
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const childrenByParent = new Map<string, SupplierStage[]>();
  for (const st of stages) {
    if (!st.parent_stage_id) continue;
    const arr = childrenByParent.get(st.parent_stage_id) ?? [];
    arr.push(st);
    childrenByParent.set(st.parent_stage_id, arr);
  }

  const childCount = (id: string) => (childrenByParent.get(id) ?? []).length;
  const inheritedSupplier = (stage: SupplierStage): InheritedSupplier | null => {
    let current: SupplierStage | undefined = stage;
    while (current) {
      if (current.is_self) return { kind: "self" };
      if (current.supplier_id) return { kind: "supplier", supplierId: current.supplier_id };
      if (current.supplier_company_id) return { kind: "company", companyId: current.supplier_company_id };
      const ph = (current.supplier_placeholder ?? "").trim();
      if (ph) return { kind: "placeholder", label: ph };
      current = current.parent_stage_id ? stageById.get(current.parent_stage_id) : undefined;
    }
    return null;
  };
  const supplierKey = (s: InheritedSupplier) =>
    s.kind === "supplier" ? `pm:${s.supplierId}`
      : s.kind === "company" ? `co:${s.companyId}`
        : s.kind === "placeholder" ? `ph:${s.label.toLowerCase()}`
          : "self";
  const hasFixedAncestorSameSupplier = (stage: SupplierStage, key: string) => {
    let current = stage.parent_stage_id ? stageById.get(stage.parent_stage_id) : undefined;
    while (current) {
      const inh = inheritedSupplier(current);
      if (
        inh && inh.kind !== "self" && supplierKey(inh) === key &&
        childCount(current.id) > 0 &&
        current.budget_mode === "fixed" &&
        Number(current.budget ?? 0) > 0
      ) return true;
      current = current.parent_stage_id ? stageById.get(current.parent_stage_id) : undefined;
    }
    return false;
  };
  const stageHasSupplierExternal = (stageId: string): boolean => {
    const direct = externals.some((es) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const esAny = es as any;
      if (esAny.stage_id !== stageId) return false;
      return !!(
        esAny.supplier_company_id ||
        esAny.supplier_id ||
        esAny.supplier_placeholder ||
        es.supplier?.id
      );
    });
    if (direct) return true;
    return (childrenByParent.get(stageId) ?? []).some((child) => stageHasSupplierExternal(child.id));
  };

  return stages
    .map((stage) => {
      const inh = inheritedSupplier(stage);
      if (!inh || inh.kind === "self") return null;
      if (stageHasSupplierExternal(stage.id)) return null;
      const key = supplierKey(inh);
      if (hasFixedAncestorSameSupplier(stage, key)) return null;
      const children = childCount(stage.id);
      const ownBudget = Number(stage.budget ?? 0) || 0;
      const mode = (stage.budget_mode ?? "calculated") as "calculated" | "fixed";
      if (children > 0 && !(mode === "fixed" && ownBudget > 0)) return null;
      const amount = mode === "fixed" && ownBudget > 0
        ? ownBudget
        : Number(stageFees[stage.id] ?? 0) || ownBudget;
      if (amount <= 0) return null;
      const displayName =
        inh.kind === "supplier"
          ? stageSupplierNames.find((c) => c.id === inh.supplierId)?.name ?? "Supplier"
          : inh.kind === "company"
            ? stageCompanyNames.find((c) => c.id === inh.companyId)?.nome ?? "Supplier"
            : inh.label;

      return {
        id: `stage-supplier-${stage.id}`,
        quote_id: quoteId,
        stage_id: stage.id,
        supplier_id: inh.kind === "supplier" ? inh.supplierId : null,
        supplier_company_id: inh.kind === "company" ? inh.companyId : null,
        supplier_placeholder: inh.kind === "placeholder" ? inh.label : null,
        description: stage.name,
        quantity: 1,
        purchase_price: amount,
        sale_price: amount,
        markup_type: "amount",
        markup_value: 0,
        supplier:
          inh.kind === "supplier" ? { id: inh.supplierId, name: displayName, active: true }
            : inh.kind === "company" ? { id: inh.companyId, name: displayName, active: true }
              : null,
      } as unknown as QuoteExternalServiceWithSupplier;
    })
    .filter((row): row is QuoteExternalServiceWithSupplier => !!row);
}