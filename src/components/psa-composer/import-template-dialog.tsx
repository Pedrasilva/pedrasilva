import { translateError } from '@/lib/translate-error';
import { Trans, useTranslation } from "react-i18next";
import uiI18n from "@/i18n/index";
/**
 * ImportTemplateDialog — replace ALL blocks in the current PSA proposal
 * with the blocks saved inside a quote template ("Save as template").
 * Two-step: pick template → confirm destructive replacement.
 */
import { useState } from "react";
import { toast } from '@/lib/toast';
import { LayoutTemplate, AlertTriangle, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useQuoteTemplates } from "@/lib/quotes/quote-templates";
import { useImportTemplateBlocks } from "@/lib/psa-proposal/use-psa-proposal";

export function ImportTemplateDialog({
  proposalId,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  hideTrigger = false,
}: {
  proposalId: string;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  hideTrigger?: boolean;
}) {
  useTranslation();
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = onOpenChangeProp ?? setOpenState;
  const [step, setStep] = useState<"pick" | "confirm">("pick");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const { data: templates = [], isLoading } = useQuoteTemplates();
  const importMut = useImportTemplateBlocks(proposalId);

  const eligible = templates.filter((t) => t.is_active && t.blocks_count > 0);
  const chosen = eligible.find((t) => t.id === templateId) ?? null;

  const reset = () => {
    setStep("pick");
    setTemplateId(null);
  };

  const onOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) reset();
  };

  const doImport = async () => {
    if (!templateId) return;
    try {
      const count = await importMut.mutateAsync(templateId);
      toast.success(uiI18n.t("crm:quoteEditor.blocksImported", { count }));
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? translateError(e.message) : uiI18n.t("crm:quoteEditor.importFailed"));
    }
  };

  return (
    <>
      {!hideTrigger && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          title={uiI18n.t("crm:quoteEditor.replaceBlocks")}
        >
          <LayoutTemplate className="mr-1 h-3.5 w-3.5" />  {uiI18n.t("crm:quoteEditor.importTemplate")} </Button>
      )}

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          {step === "pick" ? (
            <>
              <DialogHeader>
                <DialogTitle> {uiI18n.t("crm:quoteEditor.importTemplate")} </DialogTitle>
                <DialogDescription>
                   {uiI18n.t("crm:quoteEditor.replaceBlocksHint")} </DialogDescription>
              </DialogHeader>
              <div className="max-h-[60vh] overflow-y-auto">
                {isLoading ? (
                  <p className="text-sm text-muted-foreground"> {uiI18n.t("common:loading")} </p>
                ) : eligible.length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                     {uiI18n.t("crm:quoteEditor.noBlockTemplates")} </div>
                ) : (
                  <div className="grid gap-2">
                    {eligible.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => setTemplateId(tpl.id)}
                        className={cn(
                          "flex items-start gap-3 rounded-md border p-3 text-left transition-colors hover:bg-muted/50",
                          templateId === tpl.id && "border-primary bg-primary/5",
                        )}
                      >
                        <FileText className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">{tpl.name}</div>
                          {tpl.description && (
                            <div className="text-xs text-muted-foreground line-clamp-2">
                              {tpl.description}
                            </div>
                          )}
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {uiI18n.t("crm:quoteEditor.blockCount", { count: tpl.blocks_count })} · {uiI18n.t("crm:quoteEditor.stageCount", { count: tpl.stages_count })} </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                   {uiI18n.t("common:cancel")} </Button>
                <Button
                  onClick={() => setStep("confirm")}
                  disabled={!templateId}
                >
                   {uiI18n.t("common:continue")} </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                   {uiI18n.t("crm:quoteEditor.confirmReplace")} </DialogTitle>
                <DialogDescription>
                  <Trans i18n={uiI18n} i18nKey="crm:quoteEditor.replaceConfirmation" values={{ name: chosen?.name ?? "" }} components={{ strong: <strong /> }} />
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => setStep("pick")}
                  disabled={importMut.isPending}
                >
                   {uiI18n.t("common:back")} </Button>
                <Button
                  variant="destructive"
                  onClick={doImport}
                  disabled={importMut.isPending}
                >
                  {importMut.isPending ? uiI18n.t("crm:quoteEditor.importing") : uiI18n.t("crm:quoteEditor.replaceImport")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
