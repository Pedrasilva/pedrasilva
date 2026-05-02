import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const CONFIRM = "DELETE PROJECT";

type Counts = Record<string, number>;

export function HardDeleteProjectButton({ projectId }: { projectId: string }) {
  const { isAdmin } = useAuth();
  const { t } = useTranslation("common");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");

  const deps = useQuery({
    enabled: open && isAdmin,
    queryKey: ["project-deps", projectId],
    queryFn: async (): Promise<Counts> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("project_dependency_counts", {
        _project_id: projectId,
      });
      if (error) throw error;
      return (data ?? {}) as Counts;
    },
  });

  const total = deps.data ? Object.values(deps.data).reduce((a, b) => a + (b ?? 0), 0) : 0;

  const del = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("delete_project_hard", {
        _project_id: projectId,
        _confirm: confirm,
      });
      if (error) throw error;
      return data as { status: string; dependencies?: Counts };
    },
    onSuccess: async (data) => {
      if (data?.status === "deleted") {
        toast.success(t("admin.projectDelete.success"));
        await qc.invalidateQueries({ queryKey: ["pm-projects"] });
        navigate({ to: "/projects" });
      } else {
        toast.error(t("admin.projectDelete.blocked"));
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
  });

  if (!isAdmin) return null;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" /> {t("admin.projectDelete.action")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-destructive flex items-center gap-2">
            <AlertTriangle className="size-5" /> {t("admin.projectDelete.confirmTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("admin.projectDelete.confirmDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">{t("admin.projectDelete.dependency")}</th>
                  <th className="text-right px-3 py-2 font-medium">{t("admin.projectDelete.count")}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(deps.data ?? {}).map(([k, v]) => (
                  <tr key={k} className="border-t">
                    <td className="px-3 py-1.5 font-mono text-xs">{k}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${v > 0 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                      {deps.isLoading ? "…" : v}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {total > 0 ? (
            <p className="text-xs text-destructive">{t("admin.projectDelete.blockedHint")}</p>
          ) : (
            <div className="space-y-2">
              <Label className="text-xs">
                {t("admin.projectDelete.typeToConfirm", { phrase: CONFIRM })}
              </Label>
              <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={CONFIRM} />
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={del.isPending}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction asChild disabled={total > 0 || confirm !== CONFIRM || del.isPending}>
            <Button
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                if (total === 0 && confirm === CONFIRM) del.mutate();
              }}
              disabled={total > 0 || confirm !== CONFIRM || del.isPending}
            >
              {del.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : null}
              {t("admin.projectDelete.confirmAction")}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
