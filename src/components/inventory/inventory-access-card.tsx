/**
 * Admin-only management of the inventory access list.
 *
 * Rows live in `inventory_managers`; the database policies on the
 * `inventory_*` tables allow writes only for admins and listed people.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useUserCollaboratorLinks } from "@/hooks/use-remote-work";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ManagerRow = { id: string; user_id: string };

function useInventoryManagers() {
  return useQuery({
    queryKey: ["inventory", "managers"],
    queryFn: async (): Promise<ManagerRow[]> => {
      const { data, error } = await supabase
        .from("inventory_managers")
        .select("id, user_id");
      if (error) throw error;
      return (data ?? []) as ManagerRow[];
    },
  });
}

export function InventoryAccessCard() {
  const { t } = useTranslation(["inventory", "common"]);
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const { data: managers = [] } = useInventoryManagers();
  const { data: users = [] } = useUserCollaboratorLinks();
  const [selected, setSelected] = useState<string>("");

  const label = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of users) map.set(u.user_id, u.collaborator_nome || u.email);
    return map;
  }, [users]);

  const candidates = useMemo(() => {
    const taken = new Set(managers.map((m) => m.user_id));
    return users.filter((u) => !taken.has(u.user_id));
  }, [managers, users]);

  const add = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("inventory_managers")
        .insert({ user_id: userId, created_by: user?.id ?? null } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      setSelected("");
      void qc.invalidateQueries({ queryKey: ["inventory", "managers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inventory_managers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["inventory", "managers"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("inventory:access.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t("inventory:access.help")}</p>

        <div className="space-y-1.5">
          {managers.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("inventory:access.empty")}</p>
          )}
          {managers.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{label.get(m.user_id) ?? m.user_id}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => remove.mutate(m.id)}
                disabled={remove.isPending}
              >
                {t("inventory:access.remove")}
              </Button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="h-9 flex-1">
              <SelectValue placeholder={t("inventory:access.selectPerson")} />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((u) => (
                <SelectItem key={u.user_id} value={u.user_id}>
                  {u.collaborator_nome || u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={() => selected && add.mutate(selected)}
            disabled={!selected || add.isPending}
          >
            {t("inventory:access.add")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
