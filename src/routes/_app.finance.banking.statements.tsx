import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { StatementView } from "@/components/finance/statement-view";
import { BankDocumentRegistry } from "@/components/finance/bank-document-registry";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_app/finance/banking/statements")({
  component: StatementsPage,
});

function StatementsPage() {
  const { t } = useTranslation(["finance"]);
  return (
    <Tabs defaultValue="registry" className="p-4">
      <TabsList>
        <TabsTrigger value="registry">{t("finance:bankDocs.tabRegistry")}</TabsTrigger>
        <TabsTrigger value="ledger">{t("finance:bankDocs.tabLedger")}</TabsTrigger>
      </TabsList>
      <TabsContent value="registry"><BankDocumentRegistry /></TabsContent>
      <TabsContent value="ledger" className="-mx-4"><StatementView /></TabsContent>
    </Tabs>
  );
}
