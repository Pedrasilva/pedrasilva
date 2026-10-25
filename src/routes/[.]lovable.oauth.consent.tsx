import { translateError } from '@/lib/translate-error';
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import uiI18n from "@/i18n/index";
import { supabase } from "@/integrations/supabase/client";
import { oauthNs } from "@/lib/oauth-consent-ns";

// Supabase OAuth 2.1 consent screen. Reached at
// `/.lovable/oauth/consent?authorization_id=...`. TanStack Router escapes
// literal dots with `[.]`.


export const Route = createFileRoute("/.lovable/oauth/consent")({
  head: () => ({ meta: [{"title": "Authorize connection | PSA Hub"}, {"name": "description", "content": "PSA Hub \u2014 authorize connection for Pedra Silva Architects."}, {"property": "og:title", "content": "Authorize connection | PSA Hub"}, {"property": "og:description", "content": "PSA Hub \u2014 authorize connection for Pedra Silva Architects."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/login", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauthNs().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-md p-8 text-sm text-foreground">
      {uiI18n.t("access:consent.loadFailed", { error: String((error as Error)?.message ?? error) })}
    </main>
  ),
});

function Consent() {
  const { t } = useTranslation();
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientName = details?.client?.name ?? t("access:consent.application");

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const ns = oauthNs();
    const { data, error } = approve
      ? await ns.approveAuthorization(authorization_id)
      : await ns.denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError(t("access:consent.noRedirect"));
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">{t("access:consent.title", { name: clientName })}</h1>
      <p className="text-sm text-muted-foreground">
        {t("access:consent.body", { name: clientName })}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {translateError(error)}
        </p>
      )}
      <div className="flex gap-3">
        <button
          disabled={busy}
          onClick={() => decide(true)}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {t("access:consent.approve")}
        </button>
        <button
          disabled={busy}
          onClick={() => decide(false)}
          className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {t("access:consent.deny")}
        </button>
      </div>
    </main>
  );
}
