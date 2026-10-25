import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock } from "lucide-react";
import { useHasPermission } from "@/hooks/use-permissions";
import type { PermissionKey } from "@/lib/permissions";
import { useCan } from "@/hooks/use-permissions-v2";
import type { PermissionScope, V2PermissionKey } from "@/lib/permissions-v2";
import { Trans, useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const { loading, allowed } = useHasPermission(permission);
  if (loading) {
    return <div className="text-sm text-muted-foreground">{t("common:loading")}</div>;
  }
  if (!allowed) return <RestrictedCard />;
  return <>{children}</>;
}

export function RestrictedCard() {
  const { t } = useTranslation();
  return (
      <Card className="border-clay/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4" /> {t("access:restricted.title")}
          </CardTitle>
          <CardDescription>
            <Trans i18nKey="access:restricted.permissionHint" components={{ sheet: <Link to="/hr/minha-ficha" className="underline underline-offset-2" /> }} />
          </CardDescription>
        </CardHeader>
      </Card>
    );
}

/**
 * Same as PermissionGate but for v2 (module + scope) permissions.
 * Passes when the user holds `permission` at `scope` or broader; admins always pass.
 */
export function V2PermissionGate({
  permission,
  scope = "own",
  children,
}: {
  permission: V2PermissionKey;
  scope?: PermissionScope;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { loading, allowed } = useCan(permission, scope);
  if (loading) {
    return <div className="text-sm text-muted-foreground">{t("common:loading")}</div>;
  }
  if (!allowed) return <RestrictedCard />;
  return <>{children}</>;
}
