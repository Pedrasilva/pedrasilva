import { createFileRoute } from "@tanstack/react-router";
import { CompanyDetail } from "@/components/crm/company-detail";

export const Route = createFileRoute("/_app/finance/clients/$companyId")({
  component: FinanceClientDetailPage,
});

function FinanceClientDetailPage() {
  const { companyId } = Route.useParams();
  return (
    <CompanyDetail
      companyId={companyId}
      back={{ to: "/finance/invoicing/clients", label: "Clientes" }}
    />
  );
}
