/**
 * ImportTemplateDialog — replace ALL blocks in the current PSA proposal
 * with the blocks saved inside a quote template ("Save as template").
 * Two-step: pick template → confirm destructive replacement.
 */
import { useState } from "react";
import { toast } from "sonner";
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

export function ImportTemplateDialog({ proposalId }: { proposalId: string }) {
  const [open, setOpen] = useState(false);
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
      toast.success(`${count} bloco(s) importado(s) do template.`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao importar template");
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        title="Substituir todos os blocos pela biblioteca de um template"
      >
        <LayoutTemplate className="mr-1 h-3.5 w-3.5" /> Importar template
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          {step === "pick" ? (
            <>
              <DialogHeader>
                <DialogTitle>Importar template</DialogTitle>
                <DialogDescription>
                  Escolhe um template guardado. Ao confirmar, todos os blocos
                  atuais desta proposta serão substituídos pelos blocos do
                  template selecionado.
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-[60vh] overflow-y-auto">
                {isLoading ? (
                  <p className="text-sm text-muted-foreground">A carregar…</p>
                ) : eligible.length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    Não há templates com blocos guardados. Usa "Guardar como
                    template" numa proposta para criar um.
                  </div>
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
                            {tpl.blocks_count} bloco(s) · {tpl.stages_count} fase(s)
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => setStep("confirm")}
                  disabled={!templateId}
                >
                  Continuar
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  Confirmar substituição
                </DialogTitle>
                <DialogDescription>
                  Esta ação vai <strong>apagar todos os blocos</strong> atuais
                  desta proposta e substitui-los pelos blocos do template
                  <strong> "{chosen?.name}"</strong>. Esta operação não pode
                  ser anulada.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => setStep("pick")}
                  disabled={importMut.isPending}
                >
                  Voltar
                </Button>
                <Button
                  variant="destructive"
                  onClick={doImport}
                  disabled={importMut.isPending}
                >
                  {importMut.isPending ? "A importar…" : "Substituir e importar"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
