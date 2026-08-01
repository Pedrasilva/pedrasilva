import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy proposal detail retired — redirect to the quote editor.
export const Route = createFileRoute("/_app/crm/pipeline/$proposalId")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/crm/quotes/$quoteId", params: { quoteId: params.proposalId } });
  },
});
