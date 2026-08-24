import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CompanyPicker } from "@/components/crm/company-picker";
import { useUpdateProject } from "@/lib/projects/use-planner";
import { toast } from "sonner";

export function ProjectClientField({
  projectId,
  companyId,
  client,
}: {
  projectId: string;
  companyId: string | null;
  client: string | null;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(companyId);
  const update = useUpdateProject();

  async function save() {
    if (!picked) return;
    const { data, error } = await supabase
      .from("companies")
      .select("nome")
      .eq("id", picked)
      .maybeSingle();
    if (error) {
      toast.error(error.message);
      return;
    }
    try {
      await update.mutateAsync({
        id: projectId,
        patch: { company_id: picked, client: data?.nome ?? client },
      });
      setOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setPicked(companyId); setOpen(true); }}
        className="group flex w-full items-center justify-between gap-2 text-left text-sm font-medium text-foreground hover:text-primary"
        title={t("projects:detail.sidebar.editClient", { defaultValue: "Change client" })}
      >
        <span className={client ? "" : "text-muted-foreground"}>
          {client ?? t("projects:detail.header.noClient")}
        </span>
        <Pencil className="h-3 w-3 shrink-0 opacity-0 transition group-hover:opacity-70" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("projects:detail.sidebar.editClient", { defaultValue: "Change client" })}
            </DialogTitle>
          </DialogHeader>
          <CompanyPicker value={picked} onChange={setPicked} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("common:actions.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button onClick={save} disabled={!picked || update.isPending}>
              {t("common:actions.save", { defaultValue: "Save" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
