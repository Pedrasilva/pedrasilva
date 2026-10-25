import { useTranslation } from "react-i18next";
import { createFileRoute } from "@tanstack/react-router";
import { CompanyDetail } from "@/components/crm/company-detail";

export const Route = createFileRoute("/_app/finance/clients/$companyId")({
  head: () => ({ meta: [{"title": "Client details | PSA Hub"}, {"name": "description", "content": "PSA Hub \u2014 client details for Pedra Silva Architects."}, {"property": "og:title", "content": "Client details | PSA Hub"}, {"property": "og:description", "content": "PSA Hub \u2014 client details for Pedra Silva Architects."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
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
