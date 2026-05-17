import { createFileRoute } from "@tanstack/react-router";
import { BankBalancesSection } from "@/components/finance/sections/legacy-sections";

export const Route = createFileRoute("/_app/finance/banking/balances")({
  component: BankBalancesSection,
});
