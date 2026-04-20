import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { ArrowLeft, Plus, Trash2, FileDown, Save } from "lucide-react";
import { format, addDays } from "date-fns";
import { toast } from "sonner";
import { useProjectDetail } from "@/lib/projects/use-planner";
import { useInvoiceSettings } from "@/lib/projects/use-invoice-settings";
import { useCreateInvoice, useNextInvoiceNumber } from "@/lib/projects/use-invoices";
import { useDownloadInvoicePdf } from "@/lib/projects/use-download-invoice-pdf";
import { euros } from "@/lib/projects/gantt-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_app/projects/$projectId/invoices/new")({
  component: NewInvoicePage,
});

interface LineDraft {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  stage_id: string | null;
}

function NewInvoicePage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const { data: detail } = useProjectDetail(projectId);
  const { data: settings } = useInvoiceSettings(projectId);
  const { data: nextNumber } = useNextInvoiceNumber(projectId);
  const create = useCreateInvoice(projectId);
  const download = useDownloadInvoicePdf(projectId);

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientNif, setClientNif] = useState("");
  const [raisedDate, setRaisedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dueDate, setDueDate] = useState(format(addDays(new Date(), 30), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([
    { id: crypto.randomUUID(), description: "", quantity: 1, rate: 0, stage_id: null },
  ]);

  // Initialise defaults once data loads
  useEffect(() => {
    if (nextNumber && !invoiceNumber) setInvoiceNumber(nextNumber);
  }, [nextNumber, invoiceNumber]);
  useEffect(() => {
    if (detail?.project && !clientName) setClientName(detail.project.client ?? "");
  }, [detail, clientName]);
  useEffect(() => {
    if (settings) {
      if (!notes && settings.default_notes) setNotes(settings.default_notes);
      setDueDate(format(addDays(new Date(raisedDate), settings.payment_terms_days ?? 30), "yyyy-MM-dd"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, raisedDate]);

  const subtotal = useMemo(
    () => lines.reduce((a, l) => a + Number(l.quantity) * Number(l.rate), 0),
    [lines],
  );
  const vatRate = Number(settings?.vat_rate ?? 23) / 100;
  const vatAmount = subtotal * vatRate;
  const total = subtotal + vatAmount;

  const stages = detail?.stages ?? [];

  const updateLine = (id: string, patch: Partial<LineDraft>) => {
    setLines((curr) => curr.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };
  const removeLine = (id: string) => setLines((curr) => curr.filter((l) => l.id !== id));
  const addLine = () =>
    setLines((curr) => [...curr, { id: crypto.randomUUID(), description: "", quantity: 1, rate: 0, stage_id: null }]);

  const addStageLine = (stageId: string) => {
    const stage = stages.find((s) => s.id === stageId);
    if (!stage) return;
    setLines((curr) => [
      ...curr,
      {
        id: crypto.randomUUID(),
        description: stage.name,
        quantity: 1,
        rate: Number(stage.budget),
        stage_id: stage.id,
      },
    ]);
  };

  const buildPayload = () => {
    const validLines = lines.filter((l) => l.description.trim());
    return {
      invoice: {
        invoice_number: invoiceNumber || nextNumber || "INV-0001",
        client_name: clientName,
        client_address: clientAddress || null,
        client_nif: clientNif || null,
        raised_date: raisedDate,
        due_date: dueDate,
        notes: notes || null,
        subtotal,
        vat_amount: vatAmount,
        total,
        status: "draft" as const,
      },
      items: validLines.map((l, i) => ({
        description: l.description,
        quantity: l.quantity,
        rate: l.rate,
        stage_id: l.stage_id,
        sort_order: i,
      })),
    };
  };

  const handleSave = async () => {
    if (!clientName.trim()) {
      toast.error("Indique o nome do cliente.");
      return;
    }
    if (lines.every((l) => !l.description.trim())) {
      toast.error("Adicione pelo menos uma linha.");
      return;
    }
    try {
      await create.mutateAsync(buildPayload());
      toast.success("Factura criada.");
      navigate({ to: "/projects/$projectId", params: { projectId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falhou a criação.");
    }
  };

  const handleSaveAndDownload = async () => {
    if (!clientName.trim()) {
      toast.error("Indique o nome do cliente.");
      return;
    }
    try {
      const inv = await create.mutateAsync(buildPayload());
      await download(inv);
      toast.success("Factura criada e PDF descarregado.");
      navigate({ to: "/projects/$projectId", params: { projectId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falhou a operação.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] px-6 py-8">
      <Link
        to="/projects/$projectId"
        params={{ projectId }}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Projecto
      </Link>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Studio · Facturação</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Nova factura</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {detail?.project.name ?? "Projecto"} · IVA {Number(settings?.vat_rate ?? 23)}%
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleSave} disabled={create.isPending} className="gap-1.5">
            <Save className="h-4 w-4" /> Guardar
          </Button>
          <Button onClick={handleSaveAndDownload} disabled={create.isPending} className="gap-1.5">
            <FileDown className="h-4 w-4" /> Guardar + PDF
          </Button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cliente</h2>
          <div className="space-y-3">
            <Field label="Nome">
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Nome do cliente" />
            </Field>
            <Field label="Morada">
              <Input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} placeholder="Morada" />
            </Field>
            <Field label="NIF">
              <Input value={clientNif} onChange={(e) => setClientNif(e.target.value)} placeholder="Número fiscal" />
            </Field>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Detalhes</h2>
          <div className="space-y-3">
            <Field label="Número">
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder={nextNumber} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Emitida">
                <Input type="date" value={raisedDate} onChange={(e) => setRaisedDate(e.target.value)} />
              </Field>
              <Field label="Vencimento">
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </Field>
            </div>
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Linhas</h2>
          <div className="flex items-center gap-2">
            {stages.length > 0 && (
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    addStageLine(e.target.value);
                    e.target.value = "";
                  }
                }}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                defaultValue=""
              >
                <option value="" disabled>+ Linha de fase…</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({euros(Number(s.budget))})
                  </option>
                ))}
              </select>
            )}
            <Button variant="outline" size="sm" onClick={addLine} className="gap-1">
              <Plus className="h-3.5 w-3.5" /> Linha
            </Button>
          </div>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-5 py-2 text-left font-medium">Descrição</th>
                <th className="px-3 py-2 text-right font-medium w-24">Qtd</th>
                <th className="px-3 py-2 text-right font-medium w-32">Tarifa</th>
                <th className="px-3 py-2 text-right font-medium w-32">Total</th>
                <th className="px-5 py-2 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lines.map((l) => (
                <tr key={l.id} className="hover:bg-accent/20">
                  <td className="px-5 py-2">
                    <Input
                      value={l.description}
                      onChange={(e) => updateLine(l.id, { description: e.target.value })}
                      placeholder="Descrição da linha"
                      className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={l.quantity}
                      onChange={(e) => updateLine(l.id, { quantity: Number(e.target.value) })}
                      className="border-0 bg-transparent px-0 text-right font-mono shadow-none focus-visible:ring-0"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={l.rate}
                      onChange={(e) => updateLine(l.id, { rate: Number(e.target.value) })}
                      className="border-0 bg-transparent px-0 text-right font-mono shadow-none focus-visible:ring-0"
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">
                    {euros(l.quantity * l.rate)}
                  </td>
                  <td className="px-5 py-2 text-right">
                    <button
                      onClick={() => removeLine(l.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Remover linha"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/20">
              <tr>
                <td colSpan={3} className="px-5 py-2 text-right text-xs text-muted-foreground">Subtotal</td>
                <td className="px-3 py-2 text-right font-mono">{euros(subtotal)}</td>
                <td></td>
              </tr>
              <tr>
                <td colSpan={3} className="px-5 py-2 text-right text-xs text-muted-foreground">
                  IVA ({Number(settings?.vat_rate ?? 23)}%)
                </td>
                <td className="px-3 py-2 text-right font-mono">{euros(vatAmount)}</td>
                <td></td>
              </tr>
              <tr>
                <td colSpan={3} className="px-5 py-2 text-right text-xs font-semibold uppercase tracking-wider">Total</td>
                <td className="px-3 py-2 text-right font-mono text-base font-semibold">{euros(total)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notas</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Notas adicionais para a factura…"
          className="w-full rounded-md border border-border bg-background p-2 text-sm outline-none focus:border-foreground/30"
        />
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
