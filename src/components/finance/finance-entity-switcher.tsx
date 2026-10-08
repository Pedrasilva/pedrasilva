/**
 * Entity switcher for the finance area. The database decides which entity a
 * user sees (current_finance_entity + RLS), so switching here changes every
 * finance screen at once and no screen can ever mix two entities.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const FINANCE_ENTITY_KEY = ["finance", "entity"] as const;

export function useFinanceEntity() {
  return useQuery({
    queryKey: FINANCE_ENTITY_KEY,
    queryFn: async () => {
      const [list, cur] = await Promise.all([
        supabase.rpc("my_finance_entities"),
        supabase.rpc("current_finance_entity"),
      ]);
      if (list.error) throw list.error;
      if (cur.error) throw cur.error;
      return {
        entities: (list.data ?? []) as Array<{ id: string; name: string; nif: string }>,
        currentId: (cur.data as string | null) ?? null,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function FinanceEntitySwitcher() {
  const { t } = useTranslation(["finance"]);
  const qc = useQueryClient();
  const q = useFinanceEntity();
  const entities = q.data?.entities ?? [];
  if (entities.length < 2) return null;

  const onChange = async (id: string) => {
    const { error } = await supabase.rpc("set_finance_entity", { _entity_id: id });
    if (error) {
      toast.error(error.message);
      return;
    }
    // Every cached row belongs to the previous entity: drop it all and refetch.
    qc.removeQueries({ predicate: (query) => query.queryKey[0] !== FINANCE_ENTITY_KEY[0] || query.queryKey[1] !== FINANCE_ENTITY_KEY[1] });
    await qc.invalidateQueries();
  };

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-xs text-muted-foreground sm:inline">
        {t("finance:entity.label")}
      </span>
      <Select value={q.data?.currentId ?? undefined} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-[180px]" aria-label={t("finance:entity.label")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {entities.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {e.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
