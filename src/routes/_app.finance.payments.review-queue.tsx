import { createFileRoute, redirect } from "@tanstack/react-router";
import { ReviewQueue } from "@/components/finance/review-queue";
import { checkFinanceAccess } from "@/lib/finance/access";

export const Route = createFileRoute("/_app/finance/payments/review-queue")({
  beforeLoad: async () => {
    const ok = await checkFinanceAccess();
    if (!ok) throw redirect({ to: "/" });
  },
  component: ReviewQueue,
});
