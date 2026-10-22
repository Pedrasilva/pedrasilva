import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, XCircle, RefreshCw, Link2 } from "lucide-react";
import { ModuleSubnav } from "@/components/shell/ModuleSubnav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useMyPermissionsV2 } from "@/hooks/use-permissions-v2";
import { supabase } from "@/integrations/supabase/client";
import { metaConnectionCheck } from "@/lib/marketing/meta-connection-check.functions";
import { permissionChecks } from "@/lib/marketing/meta-connection";

export const Route = createFileRoute("/_app/marketing/settings")({
  component: MarketingSettingsPage,
  head: () => ({ meta: [
    { title: "Marketing Settings — PSA Hub" },
    { name: "description", content: "Meta connection status and Instagram permissions for Pedra Silva Arquitectos." },
    { property: "og:title", content: "Marketing Settings — PSA Hub" },
    { property: "og:description", content: "Meta connection status and Instagram permissions for Pedra Silva Arquitectos." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
});

function MarketingSettingsPage() {
  const { t, i18n } = useTranslation("marketing");
  const { isAdmin, loading } = useAuth();
  const { can } = useMyPermissionsV2();
  const allowed = isAdmin || can("marketing.view", "own");
  const client = useQueryClient();
  const check = useServerFn(metaConnectionCheck);
  const [testing, setTesting] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["marketing-meta-settings"], enabled: allowed && !loading,
    queryFn: async () => {
      const { data, error } = await supabase.from("marketing_settings").select("*").eq("id", true).maybeSingle();
      if (error) throw new Error("Settings unavailable");
      return data;
    },
  });
  const settings = query.data;
  const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString(i18n.language) : "—";
  async function testConnection() {
    if (testing || !isAdmin) return;
    setTesting(true); setErrorCode(null);
    try {
      const result = await check();
      setErrorCode(result.errorCode);
      await client.invalidateQueries({ queryKey: ["marketing-meta-settings"] });
    } catch { setErrorCode("requestFailed"); }
    finally { setTesting(false); }
  }
  return <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
    <h1 className="text-2xl font-semibold">{t("common:settings")}</h1>
    <ModuleSubnav moduleId="marketing" />
    {loading ? <p>{t("common:loading")}</p> : !allowed ? <p className="text-destructive">{t("meta.noAccess")}</p> :
      <Card className="max-w-3xl space-y-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Link2 className="h-5 w-5" />{t("meta.title")}</h2>
          {isAdmin && <Button variant="outline" disabled={testing} onClick={testConnection}>
            <RefreshCw className={`mr-2 h-4 w-4 ${testing ? "animate-spin" : ""}`} />{t(testing ? "meta.testing" : "meta.test")}
          </Button>}
        </div>
        {query.isPending ? <p>{t("common:loading")}</p> : query.isError ? <p className="text-destructive">{t("meta.errors.loadFailed")}</p> : <>
          <p className={settings?.connection_ok ? "text-success" : "text-warning"}>{t(settings ? settings.connection_ok ? "meta.connected" : "meta.needsAttention" : "meta.notTested")}</p>
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">{t("meta.page")}</dt><dd className="break-words font-medium">{settings?.meta_page_name ?? "—"}</dd><dd className="break-all text-xs text-muted-foreground">{settings?.meta_page_id}</dd></div>
            <div><dt className="text-muted-foreground">{t("posts.platform.instagram")}</dt><dd className="break-words font-medium">{settings?.instagram_username ? `@${settings.instagram_username}` : "—"}</dd><dd className="break-all text-xs text-muted-foreground">{settings?.instagram_account_id}</dd></div>
            <div><dt className="text-muted-foreground">{t("meta.expiry")}</dt><dd>{settings?.token_never_expires ? t("meta.neverExpires") : date(settings?.token_expires_at)}</dd></div>
            <div><dt className="text-muted-foreground">{t("meta.dataExpiry")}</dt><dd>{date(settings?.data_access_expires_at)}</dd></div>
            <div><dt className="text-muted-foreground">{t("meta.lastTest")}</dt><dd>{date(settings?.last_tested_at)}</dd></div>
            <div><dt className="text-muted-foreground">{t("meta.connectedAt")}</dt><dd>{date(settings?.connected_at)}</dd></div>
          </dl>
          <div className="space-y-2 border-t pt-4">
            <h3 className="text-sm font-semibold">{t("meta.permissions")}</h3>
            {permissionChecks(settings?.granted_permissions ?? []).map((item) => <div key={item.permission} className="flex items-center gap-2 text-sm">
              {item.granted ? <CheckCircle2 aria-label={t("meta.granted")} className="h-4 w-4 shrink-0 text-success" /> : <XCircle aria-label={t("meta.missing")} className="h-4 w-4 shrink-0 text-destructive" />}
              <span className="min-w-0 break-all font-mono text-xs">{item.permission}</span>
            </div>)}
            {(settings?.granted_permissions ?? []).filter((s) => !permissionChecks([]).some((p) => p.permission === s)).map((scope) => <div key={scope} className="break-all font-mono text-xs text-success">{scope}</div>)}
          </div>
        </>}
        {(errorCode ?? settings?.last_error_code) && <p role="alert" className="text-sm text-destructive">{t(`meta.errors.${errorCode ?? settings?.last_error_code}`)}</p>}
      </Card>}
  </div>;
}