/**
 * ApplyTemplateDialog — apply a Quote Template to an existing quote
 * from inside the workspace. Appends template stages, dependencies,
 * external services, payment rules and proposal blocks to the current
 * quote (does not overwrite existing rows). Intended for the Conteúdo
 * tab so users can adopt the editorially approved Healthcare Master
 * Template (or any other template) after the quote is already created.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LayoutTemplate } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QuoteTemplatePicker } from "@/components/quotes/quote-template-picker";
import {
  useInstantiateQuoteTemplate,
  type QuoteTemplateCategory,
} from "@/lib/quotes/quote-templates";

export function ApplyTemplateDialog({
  quoteId,
  category,
}: {
  quoteId: string;
  category: QuoteTemplateCategory;
}) {
  const { t } = useTranslation("crm");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const instantiate = useInstantiateQuoteTemplate();

  const apply = async () => {
    if (!templateId) return;
    try {
      const res = await instantiate.mutateAsync({ quoteId, templateId });
      toast.success(
        t("templates.apply.toast", {
          stages: res.stages,
          rules: res.payment_items,
          blocks: res.proposal_blocks,
        }),
      );
      // Refresh everything the workspace renders.
      qc.invalidateQueries({ queryKey: ["quote_stages", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote_dependencies", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote_external_services", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote_payment_schedule", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote_proposal_document", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote_proposal_document_blocks"] });
      setOpen(false);
      setTemplateId(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <LayoutTemplate className="h-4 w-4 mr-2" />
        {t("templates.apply.button")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("templates.apply.title")}</DialogTitle>
            <DialogDescription>{t("templates.apply.description")}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <QuoteTemplatePicker
              category={category}
              value={templateId}
              onChange={setTemplateId}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={instantiate.isPending}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={apply}
              disabled={!templateId || instantiate.isPending}
            >
              {t("templates.apply.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
