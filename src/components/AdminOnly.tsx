import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Renderiza `children` apenas se o utilizador for admin efectivo.
 * Caso contrário, mostra um aviso de acesso restrito.
 *
 * Nota: a segurança real é imposta pelas RLS policies do Supabase. Este
 * componente serve apenas para evitar mostrar o esqueleto da página e
 * orientar o utilizador.
 */
export function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useAuth();
  if (loading) {
    return <div className="text-sm text-muted-foreground">A carregar…</div>;
  }
  if (!isAdmin) {
    return (
      <Card className="border-clay/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4" /> Acesso restrito
          </CardTitle>
          <CardDescription>
            Esta página contém informação confidencial e está reservada à
            equipa Backoffice. Se precisa de consultar a sua ficha salarial,
            visite{" "}
            <Link to="/minha-ficha" className="underline underline-offset-2">
              Minha ficha
            </Link>
            .
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return <>{children}</>;
}
