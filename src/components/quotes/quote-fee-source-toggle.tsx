/**
 * Quote-level "Contract value source" switch.
 *
 * Two modes:
 *   • allocation → totals derive from resource allocations × sale rates
 *   • budget     → totals derive from the manual `budget` typed on each
 *                  leaf stage (parents auto-sum children)
 *
 * Persisted on fee_proposals.fee_source_mode. Applies to the whole quote
 * (all grandparents / stages / suppliers).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import { supabase } from "@/integrations/supabase/client";
import { Calculator, Wallet } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type FeeSourceMode = "allocation" | "budget";

export function QuoteFeeSourceToggle({
  quoteId,
  compact = false,
}: {
  quoteId: string;
  compact?: boolean;
}) {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["fee-proposal-fee-source-mode", quoteId],
    enabled: !!quoteId,
    queryFn: async (): Promise<FeeSourceMode> => {
      const { data, error } = await db
        .from("fee_proposals")
        .select("fee_source_mode")
        .eq("id", quoteId)
        .single();
      if (error) throw new Error(error.message);
      return (data?.fee_source_mode === "budget" ? "budget" : "allocation") as FeeSourceMode;
    },
  });

  const mutate = useMutation({
    mutationFn: async (mode: FeeSourceMode) => {
      const { error } = await db
        .from("fee_proposals")
        .update({ fee_source_mode: mode })
        .eq("id", quoteId);
      if (error) throw new Error(error.message);
      return mode;
    },
    onSuccess: (mode) => {
      toast.success(
        mode === "budget"
          ? "Contract value now uses Budget values"
          : "Contract value now uses Resource Allocations",
      );
      qc.invalidateQueries({ queryKey: ["fee-proposal-fee-source-mode", quoteId] });
      qc.invalidateQueries({ queryKey: ["fee-proposal-summary", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-financials", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-payment-schedule", quoteId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const value: FeeSourceMode = q.data ?? "allocation";

  const toggle = (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => {
        if (!v || v === value) return;
        mutate.mutate(v as FeeSourceMode);
      }}
      className="shrink-0"
    >
      <ToggleGroupItem value="allocation" aria-label="Alocação de recursos" className="gap-1.5">
        <Calculator className="h-3.5 w-3.5" />
        Alocação de recursos
      </ToggleGroupItem>
      <ToggleGroupItem value="budget" aria-label="Valor do orçamento" className="gap-1.5">
        <Wallet className="h-3.5 w-3.5" />
        Valor do orçamento
      </ToggleGroupItem>
    </ToggleGroup>
  );

  if (compact) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <Label className="text-xs">Origem do valor do contrato</Label>
          <p className="text-[11px] text-muted-foreground">
            Aplica a todo o projeto — fases, sub-fases e fornecedores.
          </p>
        </div>
        {toggle}
      </div>
    );
  }

  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">Origem do valor do contrato</Label>
          <p className="text-xs text-muted-foreground">
            Aplica a todo o projeto — todas as fases, sub-fases e fornecedores.
          </p>
        </div>
        {toggle}
      </CardContent>
    </Card>
  );
}
