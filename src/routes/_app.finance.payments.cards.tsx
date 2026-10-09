import { createFileRoute } from "@tanstack/react-router";
import { PaymentCardsList } from "@/components/finance/payment-cards-list";

export const Route = createFileRoute("/_app/finance/payments/cards")({
  component: PaymentCardsList,
});
