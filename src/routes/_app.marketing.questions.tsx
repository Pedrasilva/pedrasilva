import { ModuleSubnav } from "@/components/shell/ModuleSubnav";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { V2PermissionGate } from "@/components/PermissionGate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listNudgesOverview, resendNudge, type NudgeOverviewRow } from "@/lib/marketing/nudges.functions";

export const Route = createFileRoute("/_app/marketing/questions")({
  component: () => (
    <V2PermissionGate permission="marketing.curate" scope="all">
      <QuestionsPage />
    </V2PermissionGate>
  ),
  head: () => ({
    meta: [
      { title: "Questions to architects — Portal Pedra Silva" },
      { name: "description", content: "Every marketing question and briefing request sent to architects, with status and answers." },
      { property: "og:title", content: "Questions to architects — Portal Pedra Silva" },
      { property: "og:description", content: "Every marketing question and briefing request sent to architects, with status and answers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const ALL = "__all";
type State = "pending" | "answered" | "dismissed" | "expired";
const stateOf = (r: NudgeOverviewRow): State => (r.expired ? "expired" : (r.status as State));
const STATE_CLASS: Record<State, string> = {
  pending: "bg-warning/15 text-warning border-warning/30",
  answered: "bg-success/15 text-success border-success/30",
  dismissed: "bg-muted text-muted-foreground border-border",
  expired: "bg-muted text-muted-foreground border-border",
};

function QuestionsPage() {
  const { t } = useTranslation("marketing");
  const qc = useQueryClient();
  const listFn = useServerFn(listNudgesOverview);
  const resendFn = useServerFn(resendNudge);
  const { data: rows = [], isLoading } = useQuery({ queryKey: ["marketing-questions"], queryFn: () => listFn() });
  const [status, setStatus] = useState<string>("pending");
  const [architect, setArchitect] = useState<string>(ALL);
  const [project, setProject] = useState<string>(ALL);
  const [kind, setKind] = useState<string>(ALL);
  const [busy, setBusy] = useState<string | null>(null);

  const architects = useMemo(() => [...new Map(rows.map((r) => [r.architect_user_id, r.architectName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [rows]);
  const projects = useMemo(() => [...new Map(rows.filter((r) => r.project_id).map((r) => [r.project_id!, r.projectName ?? "—"])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [rows]);
  const list = rows.filter((r) => (status === ALL || stateOf(r) === status) && (architect === ALL || r.architect_user_id === architect)
    && (project === ALL || r.project_id === project) && (kind === ALL || r.kind === kind));

  const resend = async (id: string) => {
    setBusy(id);
    try { await resendFn({ data: { nudgeId: id } }); toast.success(t("questions.resent")); }
    catch (e) { toast.error(e instanceof Error ? e.message : t("questions.error")); }
    finally { setBusy(null); qc.invalidateQueries({ queryKey: ["marketing-questions"] }); }
  };

  const Filter = ({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: [string, string][] }) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-44" aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{label}</SelectItem>
        {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("questions.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("questions.subtitle")}</p>
      </div>
      <ModuleSubnav moduleId="marketing" />
      <div className="flex flex-wrap gap-2">
        <Filter value={status} onChange={setStatus} label={t("questions.allStatuses")}
          options={(["pending", "answered", "dismissed", "expired"] as const).map((s) => [s, t(`nudge.status.${s}`)])} />
        <Filter value={kind} onChange={setKind} label={t("questions.allKinds")}
          options={[["question", t("questions.kind.question")], ["briefing", t("questions.kind.briefing")]]} />
        <Filter value={architect} onChange={setArchitect} label={t("questions.allArchitects")} options={architects} />
        <Filter value={project} onChange={setProject} label={t("questions.allProjects")} options={projects} />
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">{t("inbox.loading")}</p> : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("questions.empty")}</p>
      ) : (
        <div className="space-y-2">
          {list.map((r) => {
            const st = stateOf(r);
            return (
              <Card key={r.id} className="space-y-1 p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className={STATE_CLASS[st]}>{t(`nudge.status.${st}`)}</Badge>
                  <Badge variant="secondary">{t(`questions.kind.${r.kind}`)}</Badge>
                  <span>{t("questions.to", { name: r.architectName })}</span>
                  <span>· {t("questions.by", { name: r.createdByName })}</span>
                  {r.sent_at && <span>· {new Date(r.sent_at).toLocaleDateString()}</span>}
                  <span>· {t(`questions.channel.${r.channel}`)}</span>
                  {st === "pending" && (
                    <Button size="sm" variant="outline" className="ml-auto h-7" disabled={busy === r.id} onClick={() => resend(r.id)}>
                      <RefreshCw className={`mr-1 h-3 w-3 ${busy === r.id ? "animate-spin" : ""}`} />{t("questions.resend")}
                    </Button>
                  )}
                </div>
                <p className="text-sm">{r.question}</p>
                <div className="flex flex-wrap gap-3 text-xs">
                  {r.projectName && (r.profileId
                    ? <Link to="/marketing/projects/$profileId" params={{ profileId: r.profileId }} className="text-primary underline">{r.projectName}</Link>
                    : <span className="text-muted-foreground">{r.projectName}</span>)}
                  {r.capture_id && <Link to="/marketing" search={{ capture: r.capture_id }} className="text-primary underline">{t("questions.openCapture")}</Link>}
                  <Link to="/nudges/$nudgeId" params={{ nudgeId: r.id }} className="text-primary underline">{t("questions.openQuestion")}</Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
