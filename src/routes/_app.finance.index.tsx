import { createFileRoute } from "@tanstack/react-router";
import { OverviewKpiBlock } from "@/components/finance/sections/legacy-sections";
import { useFinanceShell } from "@/components/finance/finance-shell-context";

export const Route = createFileRoute("/_app/finance/")({
  component: FinanceOverviewPage,
});

function FinanceOverviewPage() {
  const { vatMode } = useFinanceShell();
  return <OverviewKpiBlock vatMode={vatMode} />;
}
