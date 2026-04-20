import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import { FileText, Plus, FileDown } from "lucide-react";
import { useProjectInvoices, useInvoiceWithItems, type Invoice } from "@/lib/projects/use-invoices";
import { useDownloadInvoicePdf } from "@/lib/projects/use-download-invoice-pdf";
import { euros } from "@/lib/projects/gantt-utils";
import type { Project, StageWithAllocations } from "@/lib/projects/types";
import { toast } from "sonner";

interface Props {
  project: Project;
  stages: StageWithAllocations[];
}

export function BillingTabView({ project }: Props) {
  const { data: invoices, isLoading } = useProjectInvoices(project.id);
  const latestId = invoices?.[0]?.id ?? null;
  const { data: latest } = useInvoiceWithItems(latestId);
  const download = useDownloadInvoicePdf(project.id);

  if (isLoading) {
    return <div className="px-5 py-12 text-center text-sm text-muted-foreground">A carregar facturas…</div>;
  }

  return (
    <div className="bg-background">
      <section className="border-b border-border">
        <header className="flex items-center gap-2 border-b border-border px-5 py-3">
          <FileText className="h-4 w-4 text-primary" />
          <h3 className="font-display text-sm font-semibold text-foreground">Última factura</h3>
          {latest?.invoice && (
            <span className="text-sm text-muted-foreground">
              • <span className="text-primary">{latest.invoice.invoice_number}</span>
            </span>
          )}
          {latest?.invoice && (
            <button
              onClick={async () => {
                try {
                  await download(latest.invoice);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Falhou o download do PDF");
                }
              }}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs hover:bg-accent"
            >
              <FileDown className="h-3.5 w-3.5" /> PDF
            </button>
          )}
        </header>

        {!latest?.invoice ? (
          <div className="flex flex-col items-center justify-center gap-3 px-5 py-12 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Ainda sem facturas.</p>
            <Link
              to="/projects/$projectId/invoices/new"
              params={{ projectId: project.id }}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" /> Criar primeira
            </Link>
          </div>
        ) : (
          <LatestInvoiceCard project={project} invoice={latest.invoice} items={latest.items} />
        )}
      </section>

      <section>
        <header className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h3 className="font-display text-sm font-semibold text-foreground">Histórico</h3>
          </div>
          <Link
            to="/projects/$projectId/invoices/new"
            params={{ projectId: project.id }}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" /> Nova factura
          </Link>
        </header>

        <InvoicesTable invoices={invoices ?? []} />
      </section>
    </div>
  );
}

function LatestInvoiceCard({
  project,
  invoice,
  items,
}: {
  project: Project;
  invoice: Invoice;
  items: { id: string; description: string; quantity: number; rate: number }[];
}) {
  const subtotal = useMemo(
    () => items.reduce((a, it) => a + Number(it.quantity) * Number(it.rate), 0),
    [items],
  );

  return (
    <div className="px-5 py-4">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-foreground">Cliente</h4>
          <dl className="space-y-1 text-sm">
            <Row label="Nome" value={invoice.client_name || project.client || "—"} valueClass="text-primary" />
            <Row label="Morada" value={invoice.client_address || "—"} />
            <Row label="NIF" value={invoice.client_nif || "—"} />
          </dl>
        </div>
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-foreground">Detalhes</h4>
          <dl className="space-y-1 text-sm">
            <Row label="Emitida" value={format(parseISO(invoice.raised_date), "dd/MM/yyyy")} />
            <Row label="Vencimento" value={invoice.due_date ? format(parseISO(invoice.due_date), "dd/MM/yyyy") : "—"} />
            <Row label="Estado" value={statusLabel(invoice.status)} />
          </dl>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-xs text-muted-foreground">
            <tr>
              <th className="py-2 text-left font-medium">Descrição</th>
              <th className="py-2 text-right font-medium">Qtd</th>
              <th className="py-2 text-right font-medium">Tarifa</th>
              <th className="py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center italic text-muted-foreground">Sem linhas.</td>
              </tr>
            )}
            {items.map((it) => (
              <tr key={it.id}>
                <td className="py-2">{it.description}</td>
                <td className="py-2 text-right font-mono">{Number(it.quantity)}</td>
                <td className="py-2 text-right font-mono">{euros(Number(it.rate))}</td>
                <td className="py-2 text-right font-mono font-semibold">{euros(Number(it.quantity) * Number(it.rate))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="pt-3 text-right text-xs text-muted-foreground">Subtotal</td>
              <td className="pt-3 text-right font-mono text-sm">{euros(subtotal)}</td>
            </tr>
            <tr>
              <td colSpan={3} className="pt-1 text-right text-xs text-muted-foreground">IVA</td>
              <td className="pt-1 text-right font-mono text-sm">{euros(Number(invoice.vat_amount))}</td>
            </tr>
            <tr>
              <td colSpan={3} className="pt-1 text-right text-xs font-semibold text-foreground">Total</td>
              <td className="pt-1 text-right font-mono text-sm font-semibold">{euros(Number(invoice.total))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function InvoicesTable({ invoices }: { invoices: Invoice[] }) {
  if (invoices.length === 0) {
    return <p className="px-5 py-8 text-center text-xs italic text-muted-foreground">Sem facturas.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-5 py-2 text-left font-medium">Número</th>
            <th className="px-3 py-2 text-left font-medium">Cliente</th>
            <th className="px-3 py-2 text-right font-medium">Data</th>
            <th className="px-3 py-2 text-left font-medium">Estado</th>
            <th className="px-5 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {invoices.map((inv) => (
            <tr key={inv.id} className="hover:bg-accent/30">
              <td className="px-5 py-2.5 text-primary">{inv.invoice_number}</td>
              <td className="px-3 py-2.5">{inv.client_name || "—"}</td>
              <td className="px-3 py-2.5 text-right font-mono text-xs">
                {format(parseISO(inv.raised_date), "dd/MM/yyyy")}
              </td>
              <td className="px-3 py-2.5">
                <StatusDot status={inv.status} />
              </td>
              <td className="px-5 py-2.5 text-right font-mono">{euros(Number(inv.total))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const cls =
    status === "paid"
      ? "bg-emerald-500"
      : status === "draft"
        ? "bg-sky-400"
        : status === "sent"
          ? "bg-amber-400"
          : "bg-muted-foreground";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={`h-2 w-2 rounded-full ${cls}`} />
      <span className="capitalize">{status}</span>
    </span>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`text-sm ${valueClass ?? "text-foreground"}`}>{value}</dd>
    </div>
  );
}

function statusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}
