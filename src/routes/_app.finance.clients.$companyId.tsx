import { useTranslation } from "react-i18next";
import { createFileRoute } from "@tanstack/react-router";
import { CompanyDetail } from "@/components/crm/company-detail";

export const Route = createFileRoute("/_app/finance/clients/$companyId")({
  component: FinanceClientDetailPage,
});

function FinanceClientDetailPage() {
  const { t } = useTranslation("finance");
  const { companyId } = Route.useParams();
  return (
    <CompanyDetail
      companyId={companyId}
      back={{ to: "/finance/invoicing/clients", label: t("finance:sidebar.items.clients") }}
    />
  );
}
