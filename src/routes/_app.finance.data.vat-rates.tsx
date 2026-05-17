import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderSection } from "@/components/finance/sections/legacy-sections";

export const Route = createFileRoute("/_app/finance/data/vat-rates")({
  component: () => <PlaceholderSection titleKey="finance:sidebar.items.vatRates" />,
});
