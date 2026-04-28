import { createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { DocumentsList } from "@/components/finance/documents-list";

async function checkFinanceAccess(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return false;
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (roleRow) return true;
  const { data: permRow } = await supabase
    .from("user_permissions")
    .select("permission_key")
    .eq("user_id", userId)
    .eq("permission_key", "finance.dashboard")
    .maybeSingle();
  return !!permRow;
}

export const Route = createFileRoute("/_app/finance/documents/")({
  beforeLoad: async () => {
    const ok = await checkFinanceAccess();
    if (!ok) throw redirect({ to: "/" });
  },
  component: FinanceDocumentsPage,
});

function FinanceDocumentsPage() {
  const { t } = useTranslation(["finance"]);
  return (
    <div className="container mx-auto py-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{t("finance:documents.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("finance:documents.subtitle")}
        </p>
      </header>
      <DocumentsList variant="full" showHeader={false} />
    </div>
  );
}
