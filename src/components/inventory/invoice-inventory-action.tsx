import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InvoiceInventoryDialog } from "./invoice-inventory-dialog";
import {
  useInvoiceForInventory,
  useMarkInvoiceForInventory,
} from "@/lib/inventory/use-inventory";

/**
 * Finance-side entry point: flag a supplier invoice as containing physical
 * assets and open the inventory review step. Never touches the financial
 * amounts — it only sets the single `inventory_status` workflow marker.
 */
export function InvoiceInventoryAction({ documentId }: { documentId: string }) {
  const { t } = useTranslation(["inventory"]);
  const [open, setOpen] = useState(false);
  const { data: invoice } = useInvoiceForInventory(documentId);
  const mark = useMarkInvoiceForInventory();

  const status = invoice?.inventory_status ?? null;

  const start = async () => {
    if (!status) {
      try {
        await mark.mutateAsync({ documentId, status: "pending" });
      } catch (err) {
        toast.error((err as Error).message);
        return;
      }
    }
    setOpen(true);
  };

  return (
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
      <Button size="sm" variant="outline" onClick={start} disabled={mark.isPending}>
        <Boxes className="mr-1 h-4 w-4" />
        {t("inventory:invoice.sendToInventory")}
      </Button>
      <InvoiceInventoryDialog documentId={documentId} open={open} onOpenChange={setOpen} />
    </div>
  );
}
