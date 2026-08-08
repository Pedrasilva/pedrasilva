import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/inbox/")({
  component: InboxTriagePage,
});

function InboxTriagePage() {
  const { t } = useTranslation(["inbox", "common"]);

  const eventsQ = useQuery({
    queryKey: ["email-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_events")
        .select(
          "id, from_address, subject, snippet, category, confidence, suggested_action, status, received_at",
        )
        .order("received_at", { ascending: false, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (eventsQ.isLoading) {
    return <p className="text-sm text-muted-foreground">{t("inbox:list.loading")}</p>;
  }

  const rows = eventsQ.data ?? [];

  if (rows.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground">
        {t("inbox:list.empty")}
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2">{t("inbox:list.receivedAt")}</th>
            <th className="px-4 py-2">{t("inbox:list.from")}</th>
            <th className="px-4 py-2">{t("inbox:list.subject")}</th>
            <th className="px-4 py-2">{t("inbox:list.category")}</th>
            <th className="px-4 py-2">{t("inbox:list.suggestedAction")}</th>
            <th className="px-4 py-2">{t("inbox:list.status")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t align-top">
              <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                {r.received_at ? new Date(r.received_at).toLocaleString() : "—"}
              </td>
              <td className="px-4 py-2">{r.from_address ?? "—"}</td>
              <td className="px-4 py-2">
                <div className="font-medium">{r.subject ?? "—"}</div>
                {r.snippet && (
                  <div className="line-clamp-1 text-xs text-muted-foreground">
                    {r.snippet}
                  </div>
                )}
              </td>
              <td className="px-4 py-2">
                {r.category ? (
                  <Badge variant="secondary">
                    {r.category}
                    {r.confidence != null
                      ? ` · ${Math.round(Number(r.confidence) * 100)}%`
                      : ""}
                  </Badge>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-2">{r.suggested_action ?? "—"}</td>
              <td className="px-4 py-2">
                <Badge variant={r.status === "pending" ? "outline" : "secondary"}>
                  {t(`inbox:status.${r.status ?? "pending"}`, {
                    defaultValue: r.status ?? "—",
                  })}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
