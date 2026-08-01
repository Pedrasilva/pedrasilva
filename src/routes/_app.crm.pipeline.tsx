import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy pipeline retired — all proposals now live under Opportunities.
export const Route = createFileRoute("/_app/crm/pipeline")({
  beforeLoad: () => {
    throw redirect({ to: "/crm/opportunities" });
  },
});
