import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Boxes } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { InvoiceInventoryDialog } from "./invoice-inventory-dialog";
import { useInvoiceForInventory } from "@/lib/inventory/use-inventory";

/**
 * Inventory marker shown inside the Finance review queue.
 *
 * Before finalising, the reviewer only declares intent (`mark_for_inventory`).
 * After finalising, the same block surfaces the invoice's inventory status and
 * opens the line-by-line intake. Finance amounts are never touched here.
 */
export function ReviewQueueInventorySection({
  queueId,
  markForInventory,
  documentId,
}: {
  queueId: string;
  markForInventory: boolean;
  documentId: string | null;
}) {
  const { t } = useTranslation(["inventory"]);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: invoice } = useInvoiceForInventory(documentId ?? undefined);

  const toggle = useMutation({
    mutationFn: async (value: boolean) => {
      const { error } = await supabase
        .from("financial_document_review_queue")
        .update({ mark_for_inventory: value } as never)
        .eq("id", queueId);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["finance", "review-queue"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const status = invoice?.inventory_status ?? null;

  return (
    <div className="rounded-md border border-dashed p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={markForInventory}
            disabled={toggle.isPending || !!documentId}
            onCheckedChange={(v) => toggle.mutate(!!v)}
            className="mt-0.5"
          />
          <span>
            <span className="flex items-center gap-1.5 font-medium">
              <Boxes className="h-4 w-4" />
              {t("inventory:queue.markLabel")}
            </span>
            <span className="block text-xs text-muted-foreground">
              {t("inventory:queue.markHint")}
            </span>
          </span>
        </label>

        <div className="flex items-center gap-2">
          {status && (
            <Badge variant={status === "complete" ? "secondary" : "outline"}>
              {status === "complete"
                ? t("inventory:invoice.statusComplete")
                : status === "partially_processed"
                  ? t("inventory:invoice.statusPartial")
                  : t("inventory:invoice.statusPending")}
            </Badge>
          )}
          {documentId && (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              {t("inventory:queue.openIntake")}
            </Button>
          )}
        </div>
      </div>

      {documentId && (
        <InvoiceInventoryDialog documentId={documentId} open={open} onOpenChange={setOpen} />
      )}
    </div>
  );
}
