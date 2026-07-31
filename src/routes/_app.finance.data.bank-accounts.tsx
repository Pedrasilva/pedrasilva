import { createFileRoute } from "@tanstack/react-router";
import { BankAccountsList } from "@/components/finance/bank-accounts-list";

export const Route = createFileRoute("/_app/finance/data/bank-accounts")({
  component: BankAccountsList,
});
