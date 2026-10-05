import { createFileRoute, redirect } from "@tanstack/react-router";
import { IntakeInbox } from "@/components/finance/intake-inbox";
import { checkFinanceAccess } from "@/lib/finance/access";

export const Route = createFileRoute("/_app/finance/entrada")({
  beforeLoad: async () => {
    const ok = await checkFinanceAccess();
    if (!ok) throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [
      { title: "Caixa de entrada financeira · PSA Hub" },
      { name: "description", content: "Documentos recebidos, classificados por tipo e encaminhados para revisão." },
      { property: "og:title", content: "Caixa de entrada financeira · PSA Hub" },
      { property: "og:description", content: "Documentos recebidos, classificados por tipo e encaminhados para revisão." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IntakeInbox,
});
