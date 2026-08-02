import { createFileRoute } from "@tanstack/react-router";
import { BankTransactionsBrowser } from "@/components/finance/bank-transactions-browser";

export const Route = createFileRoute("/_app/finance/banking/transactions")({
  validateSearch: (search: Record<string, unknown>) => ({
    account: typeof search.account === "string" ? search.account : undefined,
  }),
  component: TransactionsPage,
});

function TransactionsPage() {
  const { account } = Route.useSearch();
  return <BankTransactionsBrowser initialAccountId={account} />;
}
