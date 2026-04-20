import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_app/projects/$projectId/invoices/new")({
  component: NewInvoicePage,
});

function NewInvoicePage() {
  const { projectId } = Route.useParams();

  return (
    <div className="mx-auto w-full max-w-[1100px] px-6 py-8">
      <Link
        to="/projects/$projectId"
        params={{ projectId }}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Projecto
      </Link>

      <div className="mt-3 border-b border-border pb-5">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Studio · Facturação</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Nova factura</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Estrutura criada. Hooks de facturas e PDF prontos. Formulário por activar.
        </p>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Por activar</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Esta página será o editor de linhas de factura, com numeração automática a partir das definições da empresa,
          IVA configurável e geração de PDF directa para download.
        </CardContent>
      </Card>
    </div>
  );
}
