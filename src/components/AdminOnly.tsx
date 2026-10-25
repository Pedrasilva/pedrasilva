import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";

/**
 * Renderiza `children` apenas se o utilizador for admin efectivo.
 * Caso contrário, mostra um aviso de acesso restrito.
 *
 * Nota: a segurança real é imposta pelas RLS policies do Supabase. Este
 * componente serve apenas para evitar mostrar o esqueleto da página e
 * orientar o utilizador.
 */
export function AdminOnly({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { isAdmin, loading } = useAuth();
  if (loading) {
    return <div className="text-sm text-muted-foreground">{t("common:loading")}</div>;
  }
  if (!isAdmin) {
    return (
      <Card className="border-clay/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4" /> {t("access:restricted.title")}
          </CardTitle>
          <CardDescription>
            <Trans i18nKey="access:restricted.confidentialHint" components={{ sheet: <Link to="/hr/minha-ficha" className="underline underline-offset-2" /> }} />
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return <>{children}</>;
}
