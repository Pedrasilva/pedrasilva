import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, ArrowLeft, Construction } from "lucide-react";

export const Route = createFileRoute("/_app/crm")({
  component: CRMPage,
});

function CRMPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Hub
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" /> CRM
        </h1>
        <p className="text-sm text-muted-foreground">Empresas, contactos e gestão comercial.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Construction className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Em construção</CardTitle>
          </div>
          <CardDescription>
            Este módulo está reservado. As tabelas <code>companies</code> e <code>contacts</code> já
            existem na base de dados e estão prontas para receber UI.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Próximos passos: lista de empresas, ficha de empresa com contactos associados, e ligação
          a projectos.
        </CardContent>
      </Card>
    </div>
  );
}
