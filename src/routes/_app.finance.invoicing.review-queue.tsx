import { createFileRoute, redirect } from "@tanstack/react-router";

// Retired: the finance intake lives at /finance/entrada.
export const Route = createFileRoute("/_app/finance/invoicing/review-queue")({
  beforeLoad: () => {
    throw redirect({ to: "/finance/entrada", replace: true });
  },
});
