import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock } from "lucide-react";
import { useHasPermission } from "@/hooks/use-permissions";
import type { PermissionKey } from "@/lib/permissions";

/**
 * Renderiza `children` só se o utilizador tiver a permissão indicada.
 * Caso contrário mostra um cartão de acesso restrito (a segurança real é
 * imposta pelas RLS policies).
 */
export function PermissionGate({
  permission,
  children,
}: {
  permission: PermissionKey;
  children: ReactNode;
}) {
  const { loading, allowed } = useHasPermission(permission);
  if (loading) {
    return <div className="text-sm text-muted-foreground">A carregar…</div>;
  }
  if (!allowed) {
    return (
      <Card className="border-clay/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4" /> Acesso restrito
          </CardTitle>
          <CardDescription>
            Não tem permissão para esta página. Se precisa de acesso, fale com
            um administrador. Pode sempre consultar a sua{" "}
            <Link to="/hr/minha-ficha" className="underline underline-offset-2">
              ficha pessoal
            </Link>
            .
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return <>{children}</>;
}
