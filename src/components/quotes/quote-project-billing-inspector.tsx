/**
 * Project-level billing inspector — opened from the first Gantt row
 * ("Project" summary). Lets the user bill the whole project (all stages and
 * subconsultant sub-stages rolled up) as a single line, using the same
 * parameters available per stage: start, end, 50/50 split or monthly.
 *
 * Persists to `fee_proposals.quote_build_settings.projectBilling` (JSONB).
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_PROJECT_BILLING,
  type ProjectBillingOption,
} from "@/lib/quotes/payment-generators";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function parseProjectBilling(
  raw: Record<string, unknown> | null | undefined,
): ProjectBillingOption {
  const pb = (raw?.projectBilling ?? null) as Record<string, unknown> | null;
  if (!pb) return { ...DEFAULT_PROJECT_BILLING };
  const model = pb.model === "monthly" ? "monthly" : "stage";
  const timing =
    pb.timing === "start" || pb.timing === "split" ? (pb.timing as "start" | "split") : "end";
  return {
    enabled: Boolean(pb.enabled),
    model,
    timing,
    label: typeof pb.label === "string" ? pb.label : null,
  };
}

export function QuoteProjectBillingInspector({
  quoteId,
  disabled,
  onClose,
}: {
  quoteId: string;
  disabled?: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["quote-build-settings", quoteId],
    enabled: !!quoteId,
    queryFn: async () => {
      const { data, error } = await db
        .from("fee_proposals")
        .select("quote_build_settings")
        .eq("id", quoteId)
        .single();
      if (error) throw new Error(error.message);
      return ((data as { quote_build_settings: Record<string, unknown> | null } | null)
        ?.quote_build_settings ?? {}) as Record<string, unknown>;
    },
  });

  const [draft, setDraft] = useState<ProjectBillingOption>({ ...DEFAULT_PROJECT_BILLING });
  useEffect(() => {
    if (q.data) setDraft(parseProjectBilling(q.data));
  }, [q.data]);

  const save = useMutation({
    mutationFn: async (next: ProjectBillingOption) => {
      const current = (q.data ?? {}) as Record<string, unknown>;
      const { error } = await db
        .from("fee_proposals")
        .update({ quote_build_settings: { ...current, projectBilling: next } })
        .eq("id", quoteId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quote-build-settings", quoteId] });
      qc.invalidateQueries({ queryKey: ["fee-proposal-summary", quoteId] });
      toast.success("Project billing saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <aside className="w-[320px] shrink-0 overflow-auto border-l border-border bg-surface p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Project billing</h3>
          <p className="text-xs text-muted-foreground">
            Invoice the whole project — every stage and subconsultant — as one
            line.
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Label className="text-sm">Bill as one line</Label>
          <Switch
            checked={draft.enabled}
            disabled={disabled}
            onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Billing model</Label>
          <Select
            value={draft.model}
            disabled={disabled || !draft.enabled}
            onValueChange={(v) => setDraft({ ...draft, model: v as ProjectBillingOption["model"] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stage">One payment</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {draft.model === "stage" && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">When</Label>
            <Select
              value={draft.timing}
              disabled={disabled || !draft.enabled}
              onValueChange={(v) =>
                setDraft({ ...draft, timing: v as ProjectBillingOption["timing"] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="start">Project start</SelectItem>
                <SelectItem value="end">Project end</SelectItem>
                <SelectItem value="split">50% start / 50% end</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Label</Label>
          <Input
            value={draft.label ?? ""}
            placeholder="Projeto"
            disabled={disabled || !draft.enabled}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
        </div>

        <Button
          className="w-full"
          size="sm"
          disabled={disabled || save.isPending || q.isLoading}
          onClick={() => save.mutate(draft)}
        >
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>

        <p className="text-xs text-muted-foreground">
          Applies on the next <span className="font-medium">Update schedule</span>{" "}
          run. Retainer phases keep their own monthly billing.
        </p>
      </div>
    </aside>
  );
}
