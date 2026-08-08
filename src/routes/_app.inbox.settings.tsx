import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ShieldCheck, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_app/inbox/settings")({
  component: InboxSettingsPage,
});

function InboxSettingsPage() {
  const { t } = useTranslation(["inbox", "common"]);
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [secretName, setSecretName] = useState("GOOGLE_MAIL_API_KEY_2");

  const inboxesQ = useQuery({
    queryKey: ["email-sync-state"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_sync_state")
        .select(
          "id, inbox_address, label, connector_secret_name, is_active, last_checked_at",
        )
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: isAdmin,
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["email-sync-state"] });

  const addM = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("email_sync_state").insert({
        inbox_address: address.trim().toLowerCase(),
        label: label.trim() || null,
        connector_secret_name: secretName.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("inbox:settings.added"));
      setAddress("");
      setLabel("");
      void invalidate();
    },
    onError: (e: unknown) =>
      toast.error(t("inbox:settings.error"), {
        description: e instanceof Error ? e.message : undefined,
      }),
  });

  const toggleM = useMutation({
    mutationFn: async (vars: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("email_sync_state")
        .update({ is_active: vars.is_active })
        .eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("inbox:settings.updated"));
      void invalidate();
    },
    onError: () => toast.error(t("inbox:settings.error")),
  });

  const removeM = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("email_sync_state")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("inbox:settings.removed"));
      void invalidate();
    },
    onError: () => toast.error(t("inbox:settings.error")),
  });

  if (!isAdmin) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground">
        {t("inbox:settings.adminOnly")}
      </Card>
    );
  }

  const rows = inboxesQ.data ?? [];

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          {t("inbox:settings.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("inbox:settings.subtitle")}
        </p>

        <div className="mt-4 flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t("inbox:settings.securityNote")}</span>
        </div>

        <div className="mt-5 space-y-2">
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t("inbox:settings.empty")}
            </p>
          )}
          {rows.map((r) => (
            <div
              key={r.id}
              className="grid gap-3 rounded-md border px-4 py-3 md:flex md:flex-wrap md:items-center md:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-all font-medium">
                    {r.inbox_address}
                  </span>
                  <Badge variant={r.is_active ? "secondary" : "outline"}>
                    {r.is_active
                      ? t("inbox:settings.active")
                      : t("inbox:settings.inactive")}
                  </Badge>
                </div>
                <div className="mt-0.5 break-words text-xs text-muted-foreground">
                  {r.label ? `${r.label} · ` : ""}
                  {r.connector_secret_name} · {t("inbox:settings.lastChecked")}:{" "}
                  {r.last_checked_at
                    ? new Date(r.last_checked_at).toLocaleString()
                    : t("inbox:settings.never")}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 md:justify-end">
                <Switch
                  checked={!!r.is_active}
                  onCheckedChange={(v) =>
                    toggleM.mutate({ id: r.id, is_active: v })
                  }
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeM.mutate(r.id)}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  {t("inbox:settings.remove")}
                </Button>
              </div>
            </div>
          ))}

        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-medium">{t("inbox:settings.addTitle")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {t("inbox:settings.connectorTitle")}:{" "}
          </span>
          {t("inbox:settings.connectorSteps")}
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="inbox-address">{t("inbox:settings.address")}</Label>
            <Input
              id="inbox-address"
              value={address}
              placeholder={t("inbox:settings.addressPlaceholder")}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inbox-label">{t("inbox:settings.label")}</Label>
            <Input
              id="inbox-label"
              value={label}
              placeholder={t("inbox:settings.labelPlaceholder")}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inbox-secret">
              {t("inbox:settings.secretName")}
            </Label>
            <Input
              id="inbox-secret"
              value={secretName}
              onChange={(e) => setSecretName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t("inbox:settings.secretHint")}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <Button
            disabled={!address.trim() || !secretName.trim() || addM.isPending}
            onClick={() => addM.mutate()}
          >
            {t("inbox:settings.add")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
