import { createFileRoute, redirect } from "@tanstack/react-router";
import { IntakeInbox } from "@/components/finance/intake-inbox";
import { PaidWithMissingList } from "@/components/finance/paid-with-missing-list";
import { DriveFetchNowButton } from "@/components/finance/drive-fetch-now-button";
import { checkFinanceAccess } from "@/lib/finance/access";

export const Route = createFileRoute("/_app/finance/entrada")({
  // Access check needs the browser session; on the server it always failed and sent
  // hard loads (reload, pasted link) to the Homepage.
  ssr: false,
  beforeLoad: async () => {
    if (typeof window === "undefined") return; // checked again in the browser
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
  component: EntradaPage,
});

function EntradaPage() {
  return (
    <>
      <div className="flex justify-end px-4 pt-3"><DriveFetchNowButton /></div>
      <PaidWithMissingList />
      <IntakeInbox />
    </>
  );
}
