import { translateError } from '@/lib/translate-error';
import i18n from "@/i18n/index";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useCreateProject } from "@/lib/projects/use-planner";
import { toast } from '@/lib/toast';
import { format } from "date-fns";

const PALETTE = ["#16a34a", "#2563eb", "#db2777", "#ea580c", "#9333ea", "#0d9488", "#dc2626", "#ca8a04"];

export function NewProjectDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const create = useCreateProject();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await create.mutateAsync({ name: name.trim(), client: client.trim() || undefined, color, start_date: date });
      toast.success(i18n.t("projects:quickCreate.toasts.projectCreated"));
      setOpen(false);
      setName("");
      setClient("");
    } catch (err) {
      toast.error(translateError((err as Error).message));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1 h-4 w-4" />
           {i18n.t("projects:quickCreate.newProject")} </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-xl"> {i18n.t("projects:quickCreate.newProject")} </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="p-name"> {i18n.t("common:name")} </Label>
            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={i18n.t("projects:newProjectDialog.ui.projectNamePlaceholder")} autoFocus />
          </div>
          <div>
            <Label htmlFor="p-client">{t("glossary:entity.company")}</Label>
            <Input id="p-client" value={client} onChange={(e) => setClient(e.target.value)} placeholder={i18n.t("projects:newProjectDialog.ui.clientNamePlaceholder")} />
          </div>
          <div>
            <Label htmlFor="p-date"> {i18n.t("projects:quickCreate.fields.startDate")} </Label>
            <Input id="p-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label> {i18n.t("common:color")} </Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {PALETTE.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full border-2 transition ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? i18n.t("common:creating") : i18n.t("projects:quickCreate.actions.createProject")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
