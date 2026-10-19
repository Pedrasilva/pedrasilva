import { createFileRoute } from "@tanstack/react-router";
import { InvoicesWorkspace } from "@/components/finance/invoices-workspace";

export const Route = createFileRoute("/_app/finance/invoicing/invoices")({
  head:()=>({meta:[{title:'Faturação — PSA Hub'},{name:'description',content:'Registo e revisão de faturas, recibos e importações SAF-T do atelier.'},{property:'og:title',content:'Faturação — PSA Hub'},{property:'og:description',content:'Registo e revisão de faturação do atelier.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),
  component: InvoicesWorkspace,
});
