import { createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { DocumentsList } from "@/components/finance/documents-list";
import { checkFinanceAccess } from "@/lib/finance/access";

export const Route = createFileRoute("/_app/finance/documents/")({
  // Access check needs the browser session; on the server it always failed and sent
  // hard loads (reload, pasted link) to the Homepage.
  ssr: false,
  beforeLoad: async () => {
    if (typeof window === "undefined") return; // checked again in the browser
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
