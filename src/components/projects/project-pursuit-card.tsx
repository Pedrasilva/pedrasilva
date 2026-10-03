// "Pre-contract (pursuit)" line on a project: hours and cost of all Pursuit
// entries on the project's CRM lead (pm_projects.opportunity_id). Rendered
// only where project financials are shown; the server functions also refuse
// people without project-financials access.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLinkableOpportunities, useLinkProjectOpportunity } from "@/lib/projects/use-pursuit";
import { formatHM } from "@/lib/projects/time-format";

const euros = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

export function ProjectPursuitCard({
  projectId,
  opportunityId,
  hours,
  cost,
}: {
  projectId: string;
  opportunityId: string | null;
  hours: number;
  cost: number;
}) {
  const { t } = useTranslation("projects");
  const [editing, setEditing] = useState(false);
  const opps = useLinkableOpportunities(editing || !!opportunityId);
  const link = useLinkProjectOpportunity();
  const current = (opps.data ?? []).find((o) => o.id === opportunityId);

  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium">{t("pursuit.title")}</span>
        <span className="font-mono text-xs">
          {formatHM(hours) || "0h00"} · {euros(cost)}
        </span>
        <span className="text-xs text-muted-foreground">
          {opportunityId
            ? t("pursuit.linkedTo", { name: current ? current.name : "…" })
            : t("pursuit.noLead")}
        </span>
        {!editing && (
          <Button size="sm" variant="ghost" className="ml-auto gap-1.5 text-xs" onClick={() => setEditing(true)}>
            <Link2 className="h-3.5 w-3.5" />
            {opportunityId ? t("pursuit.change") : t("pursuit.link")}
          </Button>
        )}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{t("pursuit.hint")}</p>
      {editing && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select
            value={opportunityId ?? "none"}
            onValueChange={(v) => {
              link.mutate(
                { projectId, opportunityId: v === "none" ? null : v },
                {
                  onSuccess: () => {
                    toast.success(t("pursuit.saved"));
                    setEditing(false);
                  },
                  onError: (e) => toast.error((e as Error).message),
                },
              );
            }}
          >
            <SelectTrigger className="h-8 w-[320px] text-xs">
              <SelectValue placeholder={t("pursuit.pick")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("pursuit.none")}</SelectItem>
              {(opps.data ?? []).map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                  {o.company_name ? ` · ${o.company_name}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" className="text-xs" onClick={() => setEditing(false)}>
            {t("pursuit.cancel")}
          </Button>
        </div>
      )}
    </div>
  );
}
