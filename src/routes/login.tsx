import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import logoPsa from "@/assets/logo-psa.png";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/" });
  }, [loading, session, navigate]);

  const handleGoogle = async () => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setBusy(false);
      toast.error("Erro ao iniciar sessão");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/" });
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
          <CardTitle>PSA Recursos Humanos</CardTitle>
          <CardDescription>Inicie sessão com a sua conta Google da empresa</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button className="w-full" onClick={handleGoogle} disabled={busy}>
            {busy ? "A redireccionar…" : "Entrar com Google"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            O acesso é concedido se o seu email Google estiver associado a um colaborador.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
