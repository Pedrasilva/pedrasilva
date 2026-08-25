import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type UserOption = { user_id: string; name: string };

/** App users that can own an action (mapped from resources → auth users). */
export function useActionOwners() {
  return useQuery({
    queryKey: ["action-owners"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pm_list_user_resource_map");
      if (error) throw error;
      const seen = new Set<string>();
      const out: UserOption[] = [];
      for (const row of (data ?? []) as Array<{ user_id: string | null; name: string | null }>) {
        if (!row.user_id || seen.has(row.user_id)) continue;
        seen.add(row.user_id);
        out.push({ user_id: row.user_id, name: row.name ?? row.user_id.slice(0, 8) });
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

/**
 * Picks who owns a dated action. Reminders and notifications are routed to
 * this person, so it defaults to whoever created the action.
 */
export function ActionOwnerPicker({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (userId: string | null) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("common");
  const { data: owners = [] } = useActionOwners();

  const known = value && owners.some((o) => o.user_id === value) ? value : "";

  return (
    <div className="flex items-center gap-2">
      <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <Select
        value={known}
        onValueChange={(v) => onChange(v === "__none" ? null : v)}
        disabled={disabled}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder={t("myActions.ownerPlaceholder")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">{t("myActions.ownerNone")}</SelectItem>
          {owners.map((o) => (
            <SelectItem key={o.user_id} value={o.user_id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
