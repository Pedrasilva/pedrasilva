import { createFileRoute } from "@tanstack/react-router";
import { CompanyDetail } from "@/components/crm/company-detail";

export const Route = createFileRoute("/_app/crm/companies/$companyId")({
  component: CrmCompanyDetailPage,
});

function CrmCompanyDetailPage() {
  const { companyId } = Route.useParams();
  return (
    <CompanyDetail companyId={companyId} back={{ to: "/crm/companies", label: "Empresas" }} />
  );
}
