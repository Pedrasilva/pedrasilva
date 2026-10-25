import { useTranslation } from "react-i18next";
import uiI18n from "@/i18n/index";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from '@/lib/toast';
import logoPsa from "@/assets/logo-psa.png";

// Preserve `?next=` through the whole auth flow so the MCP consent route
// (and any other same-origin destination) survives Google OAuth round-trip.
function safeRelative(next: string | undefined): string {
  if (!next) return "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{"title": "Sign in | PSA Hub"}, {"name": "description", "content": "PSA Hub \u2014 sign in for Pedra Silva Architects."}, {"property": "og:title", "content": "Sign in | PSA Hub"}, {"property": "og:description", "content": "PSA Hub \u2014 sign in for Pedra Silva Architects."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
  validateSearch: (s: Record<string, unknown>): { next?: string } =>
    typeof s.next === "string" ? { next: s.next } : {},
  component: LoginPage,
});

function LoginPage() {
  useTranslation();
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const target = safeRelative(next);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) {
      window.location.href = target;
    }
  }, [loading, session, target]);

  const handleGoogle = async () => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}${target}`,
    });
    if (result.error) {
      setBusy(false);
      toast.error(uiI18n.t("access:login.failed"));
      return;
    }
    if (result.redirected) return;
    window.location.href = target;
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img
            src={logoPsa}
            alt="Pedra Silva Architects"
            className="mx-auto mb-3 h-12 w-auto object-contain"
          />
          <CardTitle> {uiI18n.t("access:login.title")} </CardTitle>
          <CardDescription> {uiI18n.t("access:login.subtitle")} </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button className="w-full" onClick={handleGoogle} disabled={busy}>
            {busy ? uiI18n.t("access:login.redirecting") : uiI18n.t("access:login.google")}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
             {uiI18n.t("access:login.hint")} </p>
        </CardContent>
      </Card>
    </div>
  );
}
