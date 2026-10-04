import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Boxes } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InvoiceInventoryDialog } from "@/components/inventory/invoice-inventory-dialog";
import { useInventoryIntakeQueue } from "@/lib/inventory/use-inventory";

export const Route = createFileRoute("/_app/inventory/intake")({
  component: IntakePage,
  head: () => ({
    meta: [
      { title: "Inventory intake — invoices with physical items" },
      {
        name: "description",
        content:
          "Invoices flagged in Finance as containing physical items, waiting to be turned into tracked assets.",
      },
      { property: "og:title", content: "Inventory intake — invoices with physical items" },
      {
        property: "og:description",
        content:
          "Invoices flagged in Finance as containing physical items, waiting to be turned into tracked assets.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const eur = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);

function IntakePage() {
  const { t } = useTranslation(["inventory", "common"]);
  const { data = [], isLoading } = useInventoryIntakeQueue();
  const [openDoc, setOpenDoc] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Boxes className="h-4 w-4" />
          {t("inventory:intake.title")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("inventory:intake.subtitle")}</p>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">{t("common:loading")}</p>}
        {!isLoading && data.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("inventory:intake.empty")}</p>
        )}
        {data.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("inventory:intake.supplier")}</TableHead>
                <TableHead>{t("inventory:asset.invoiceNumber")}</TableHead>
                <TableHead>{t("inventory:asset.purchaseDate")}</TableHead>
                <TableHead className="text-right">{t("inventory:intake.total")}</TableHead>
                <TableHead className="text-right">{t("inventory:intake.linesToReview")}</TableHead>
                <TableHead className="w-32">{t("inventory:intake.status")}</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.counterparty_name_snapshot ?? "—"}</TableCell>
                  <TableCell>{row.document_number ?? "—"}</TableCell>
                  <TableCell>{row.issue_date ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {eur(row.total_inc_vat)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.linesToReview}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {row.inventory_status === "partially_processed"
                        ? t("inventory:invoice.statusPartial")
                        : t("inventory:invoice.statusPending")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setOpenDoc(row.id)}>
                      {t("inventory:dashboard.review")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {openDoc && (
        <InvoiceInventoryDialog
          documentId={openDoc}
          open={!!openDoc}
          onOpenChange={(v) => !v && setOpenDoc(null)}
        />
      )}
    </Card>
  );
}
