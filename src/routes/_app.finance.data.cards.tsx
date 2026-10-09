import { createFileRoute } from "@tanstack/react-router";
import { PaymentCardsList } from "@/components/finance/payment-cards-list";
import { HolderReimbursementsCard } from "@/components/finance/holder-reimbursements";

export const Route = createFileRoute("/_app/finance/data/cards")({
  component: () => (
    <div className="space-y-6">
      <PaymentCardsList />
      <HolderReimbursementsCard />
    </div>
  ),
});
