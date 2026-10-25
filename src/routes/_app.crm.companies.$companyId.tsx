import { useTranslation } from "react-i18next";
import uiI18n from "@/i18n/index";
import { createFileRoute } from "@tanstack/react-router";
import { CompanyDetail } from "@/components/crm/company-detail";

export const Route = createFileRoute("/_app/crm/companies/$companyId")({
  head: () => ({ meta: [{ title: "crm / companies / companyId — PSA Hub" }, { name: "description", content: "PSA Hub crm / companies / companyId workspace." }, { property: "og:title", content: "crm / companies / companyId — PSA Hub" }, { property: "og:description", content: "PSA Hub crm / companies / companyId workspace." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: CrmCompanyDetailPage,
});

function CrmCompanyDetailPage() {
  useTranslation();
  const { companyId } = Route.useParams();
  return (
    <CompanyDetail companyId={companyId} back={{ to: "/crm/companies", label: uiI18n.t("common:companies") }} />
  );
}
