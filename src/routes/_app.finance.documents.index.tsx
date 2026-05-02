import { createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { DocumentsList } from "@/components/finance/documents-list";
import { checkFinanceAccess } from "@/lib/finance/access";

export const Route = createFileRoute("/_app/finance/documents/")({
  beforeLoad: async () => {
    const ok = await checkFinanceAccess();
    if (!ok) throw redirect({ to: "/" });
  },
  component: FinanceDocumentsPage,
});

function FinanceDocumentsPage() {
  const { t } = useTranslation(["finance"]);
  return (
    <div className="container mx-auto py-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{t("finance:documents.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("finance:documents.subtitle")}
        </p>
      </header>
      <DocumentsList variant="full" showHeader={false} />
    </div>
  );
}
