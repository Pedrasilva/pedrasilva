import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PurchaseDuplicatesReview } from "@/components/finance/purchase-duplicates-review";
import { SupplierDuplicatesReview } from "@/components/finance/supplier-duplicates-review";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_app/finance/payments/duplicates")({
  head: () => ({
    meta: [
      { title: "Suspected duplicate suppliers and purchases — PSA Hub Finance" },
      { name: "description", content: "Review suspected duplicate suppliers and supplier invoices side by side; nothing changes until you confirm." },
      { property: "og:title", content: "Suspected duplicate suppliers and purchases — PSA Hub Finance" },
      { property: "og:description", content: "Review suspected duplicate suppliers and supplier invoices side by side; nothing changes until you confirm." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DuplicatesPage,
});

function DuplicatesPage() {
  const { t } = useTranslation("finance");
  return (
    <Tabs defaultValue="purchases" className="space-y-3">
      <TabsList>
        <TabsTrigger value="purchases">{t("finance:supplierDups.tabPurchases")}</TabsTrigger>
        <TabsTrigger value="suppliers">{t("finance:supplierDups.tabSuppliers")}</TabsTrigger>
      </TabsList>
      <TabsContent value="purchases"><PurchaseDuplicatesReview /></TabsContent>
      <TabsContent value="suppliers"><SupplierDuplicatesReview /></TabsContent>
    </Tabs>
  );
}
