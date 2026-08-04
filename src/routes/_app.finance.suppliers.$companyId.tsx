import { createFileRoute } from "@tanstack/react-router";
import { CompanyDetail } from "@/components/crm/company-detail";

export const Route = createFileRoute("/_app/finance/suppliers/$companyId")({
  component: FinanceSupplierDetailPage,
});

function FinanceSupplierDetailPage() {
  const { companyId } = Route.useParams();
  return (
    <CompanyDetail
      companyId={companyId}
      back={{ to: "/finance/payments/suppliers", label: "Fornecedores" }}
    />
  );
}
