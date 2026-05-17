import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderSection } from "@/components/finance/sections/legacy-sections";

export const Route = createFileRoute("/_app/finance/reports/vat")({
  component: () => <PlaceholderSection titleKey="finance:sidebar.items.vat" />,
});
