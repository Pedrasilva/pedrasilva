import { useTranslation } from "react-i18next";
import { createFileRoute } from "@tanstack/react-router";
import { CompanyDetail } from "@/components/crm/company-detail";

export const Route = createFileRoute("/_app/finance/suppliers/$companyId")({
  head: () => ({ meta: [{"title": "Supplier details | PSA Hub"}, {"name": "description", "content": "PSA Hub \u2014 supplier details for Pedra Silva Architects."}, {"property": "og:title", "content": "Supplier details | PSA Hub"}, {"property": "og:description", "content": "PSA Hub \u2014 supplier details for Pedra Silva Architects."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
  component: FinanceSupplierDetailPage,
});

function FinanceSupplierDetailPage() {
  const { t } = useTranslation("finance");
  const { companyId } = Route.useParams();
  return (
    <CompanyDetail
      companyId={companyId}
      back={{ to: "/finance/payments/suppliers", label: t("finance:sidebar.items.suppliers") }}
    />
  );
}
