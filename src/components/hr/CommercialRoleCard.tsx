import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useProposalRoles } from "@/lib/proposal-roles";
import type { Collaborator } from "@/lib/salary";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

/**
 * Commercial / proposal-facing role for a collaborator. Edited here, surfaced
 * by the proposal engine only — never used in operational planning.
 *
 * - `proposal_role`: from the proposal_roles catalog (label_pt/en).
 * - `billing_role`: optional commercial override (may differ).
 * - `seniority_level`: numeric (0-100) for future blended-rate analytics.
 */
export function CommercialRoleCard({
  collaborator,
  readOnly = false,
}: {
  collaborator: Collaborator;
  readOnly?: boolean;
}) {
  const { t, i18n } = useTranslation(["hr", "common"]);
  const qc = useQueryClient();
  const { data: roles = [], isLoading } = useProposalRoles();
  const isPt = i18n.language?.startsWith("pt");

  const [proposalRole, setProposalRole] = useState<string>(
    collaborator.proposal_role ?? "",
  );
  const [billingRole, setBillingRole] = useState<string>(
    collaborator.billing_role ?? "",
  );
  const [seniority, setSeniority] = useState<string>(
    collaborator.seniority_level != null
      ? String(collaborator.seniority_level)
      : "",
  );

  useEffect(() => {
    setProposalRole(collaborator.proposal_role ?? "");
    setBillingRole(collaborator.billing_role ?? "");
    setSeniority(
      collaborator.seniority_level != null
        ? String(collaborator.seniority_level)
        : "",
    );
  }, [
    collaborator.id,
    collaborator.proposal_role,
    collaborator.billing_role,
    collaborator.seniority_level,
  ]);

  const save = useMutation({
    mutationFn: async () => {
      const sen =
        seniority.trim() === "" ? null : Number(seniority);
      if (sen !== null && (Number.isNaN(sen) || sen < 0 || sen > 100)) {
        throw new Error(t("hr:commercialRole.seniorityRange"));
      }
      const { error } = await supabase
        .from("collaborators")
        .update({
          proposal_role: proposalRole.trim() || null,
          billing_role: billingRole.trim() || null,
          seniority_level: sen,
        })
        .eq("id", collaborator.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collaborators"] });
      qc.invalidateQueries({ queryKey: ["collaborator", collaborator.id] });
      toast.success(t("common:saved", { defaultValue: "Saved" }));
    },
    onError: (e: Error) => {
      toast.error(e.message);
    },
  });

  const dirty =
    (collaborator.proposal_role ?? "") !== proposalRole ||
    (collaborator.billing_role ?? "") !== billingRole ||
    String(collaborator.seniority_level ?? "") !== seniority;

  const labelFor = (code: string) => {
    const r = roles.find((x) => x.code === code);
    if (!r) return code;
    return isPt ? r.label_pt : r.label_en;
  };

  if (readOnly) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("hr:commercialRole.title")}</CardTitle>
          <CardDescription>{t("hr:commercialRole.sub")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {collaborator.proposal_role ? (
            <Badge variant="secondary">
              {t("hr:commercialRole.proposalRole")}:{" "}
              {labelFor(collaborator.proposal_role)}
            </Badge>
          ) : (
            <Badge variant="outline">
              {t("hr:commercialRole.proposalRole")}: —
            </Badge>
          )}
          {collaborator.billing_role && (
            <Badge variant="secondary">
              {t("hr:commercialRole.billingRole")}:{" "}
              {labelFor(collaborator.billing_role)}
            </Badge>
          )}
          {collaborator.seniority_level != null && (
            <Badge variant="outline">
              {t("hr:commercialRole.seniorityLevel")}:{" "}
              {collaborator.seniority_level}
            </Badge>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("hr:commercialRole.title")}</CardTitle>
        <CardDescription>{t("hr:commercialRole.sub")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t("hr:commercialRole.proposalRole")}
            </label>
            <Select
              value={proposalRole || "__none__"}
              onValueChange={(v) =>
                setProposalRole(v === "__none__" ? "" : v)
              }
              disabled={isLoading}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={t("hr:commercialRole.proposalRolePlaceholder")}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  {t("hr:commercialRole.none")}
                </SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.code}>
                    {isPt ? r.label_pt : r.label_en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t("hr:commercialRole.billingRole")}
            </label>
            <Select
              value={billingRole || "__none__"}
              onValueChange={(v) =>
                setBillingRole(v === "__none__" ? "" : v)
              }
              disabled={isLoading}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={t("hr:commercialRole.billingRolePlaceholder")}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  {t("hr:commercialRole.none")}
                </SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.code}>
                    {isPt ? r.label_pt : r.label_en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t("hr:commercialRole.seniorityLevel")}
            </label>
            <Input
              type="number"
              min={0}
              max={100}
              value={seniority}
              onChange={(e) => setSeniority(e.target.value)}
              placeholder="0-100"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={() => save.mutate()}
            disabled={!dirty || save.isPending}
            size="sm"
          >
            {save.isPending
              ? t("common:saving", { defaultValue: "Saving…" })
              : t("common:save", { defaultValue: "Save" })}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
