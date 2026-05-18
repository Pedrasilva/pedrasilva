/**
 * SaveAsTemplateDialog — snapshots the current quote into a new
 * reusable template. Opens from the quote workspace header. The quote
 * itself is untouched.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  QUOTE_TEMPLATE_PROJECT_TYPES,
  useSaveQuoteAsTemplate,
  type QuoteTemplateCategory,
  type QuoteTemplateProjectType,
} from "@/lib/quotes/quote-templates";

export function SaveAsTemplateDialog({
  open,
  onClose,
  quoteId,
  defaultName,
  defaultCategory,
}: {
  open: boolean;
  onClose: () => void;
  quoteId: string;
  defaultName: string;
  defaultCategory: QuoteTemplateCategory;
}) {
  const { t } = useTranslation("crm");
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<QuoteTemplateCategory>(defaultCategory);
  const [projectType, setProjectType] = useState<QuoteTemplateProjectType>("generic");

  const save = useSaveQuoteAsTemplate();

  const submit = async () => {
    if (!name.trim()) {
      toast.error(t("templates.errors.nameRequired"));
      return;
    }
    try {
      await save.mutateAsync({
        quoteId,
        name: name.trim(),
        description: description.trim() || null,
        category,
        project_type: projectType,
      });
      toast.success(t("templates.toasts.saved"));
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("templates.saveAs.title")}</DialogTitle>
          <DialogDescription>{t("templates.saveAs.description")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>{t("templates.fields.name")} *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>{t("templates.fields.description")}</Label>
            <Textarea rows={3} value={description}
              onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("templates.fields.category")}</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as QuoteTemplateCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="project">{t("templates.category.project")}</SelectItem>
                  <SelectItem value="time_based">{t("templates.category.time_based")}</SelectItem>
                  <SelectItem value="retainer">{t("templates.category.retainer")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("templates.fields.projectType")}</Label>
              <Select value={projectType} onValueChange={(v) => setProjectType(v as QuoteTemplateProjectType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {QUOTE_TEMPLATE_PROJECT_TYPES.map((p) => (
                    <SelectItem key={p} value={p}>{t(`templates.projectType.${p}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("templates.saveAs.preservationHint")}</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={save.isPending || !name.trim()}>
            {t("templates.saveAs.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
