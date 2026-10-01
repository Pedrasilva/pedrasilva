import { ModuleSubnav } from "@/components/shell/ModuleSubnav";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listActions } from "@/lib/marketing/actions.functions";
import { ActionFormDialog, ACTION_KINDS } from "@/components/marketing/action-form-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/marketing/actions/")({
  component: ActionsPage,
  head: () => ({
    meta: [
      { title: "Marketing actions — Portal Pedra Silva" },
      { name: "description", content: "Interviews, podcasts, photo sessions and clearance requests with an owner and a due date." },
      { property: "og:title", content: "Marketing actions — Portal Pedra Silva" },
      { property: "og:description", content: "Interviews, podcasts, photo sessions and clearance requests with an owner and a due date." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const ALL = "__all";
const today = () => new Date().toISOString().slice(0, 10);

function ActionsPage() {
  const { t, i18n } = useTranslation("marketing");
  const locale = i18n.language?.startsWith("en") ? "en-GB" : "pt-PT";
  const fn = useServerFn(listActions);
  const { data, isLoading } = useQuery({ queryKey: ["marketing-actions"], queryFn: () => fn() });
  const rows = data?.rows ?? [];
  const [status, setStatus] = useState("open");
  const [person, setPerson] = useState(ALL);
  const [project, setProject] = useState(ALL);
  const [kind, setKind] = useState(ALL);
  const [creating, setCreating] = useState(false);

  const names = rows[0]?.names ?? {};
  const persons = useMemo(() => [...new Set(rows.flatMap((r) => [r.owner_user_id, ...r.helper_user_ids]))]
    .map((id) => [id, names[id] ?? "—"] as [string, string]).sort((a, b) => a[1].localeCompare(b[1])), [rows, names]);
  const projects = useMemo(() => [...new Map(rows.filter((r) => r.profile_id).map((r) => [r.profile_id!, r.projectName ?? "—"])).entries()], [rows]);

  const list = rows.filter((r) =>
    (status === ALL || r.status === status) && (kind === ALL || r.kind === kind) &&
    (project === ALL || r.profile_id === project) &&
    (person === ALL || r.owner_user_id === person || r.helper_user_ids.includes(person)));

  const Filter = ({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: [string, string][] }) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-auto min-w-[140px]"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{label}</SelectItem>
        {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("actions.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("actions.subtitle")}</p>
        </div>
        {data?.canCurate && <Button onClick={() => setCreating(true)}><Plus className="mr-1 h-4 w-4" />{t("actions.new")}</Button>}
      </div>
      <ModuleSubnav moduleId="marketing" />
      <div className="flex flex-wrap gap-2">
        <Filter value={status} onChange={setStatus} label={t("actions.allStatuses")}
          options={(["open", "done", "cancelled"] as const).map((s) => [s, t(`actions.status.${s}`)])} />
        <Filter value={person} onChange={setPerson} label={t("actions.allPeople")} options={persons} />
        <Filter value={project} onChange={setProject} label={t("questions.allProjects")} options={projects} />
        <Filter value={kind} onChange={setKind} label={t("questions.allKinds")} options={ACTION_KINDS.map((k) => [k, t(`actions.kind.${k}`)])} />
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">{t("inbox.loading")}</p> : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("actions.empty")}</p>
      ) : (
        <Card className="divide-y">
          {list.map((r) => {
            const overdue = r.status === "open" && !!r.due_date && r.due_date < today();
            return (
              <Link key={r.id} to="/marketing/actions/$actionId" params={{ actionId: r.id }}
                className={cn("grid gap-1 px-4 py-3 text-sm hover:bg-muted/50 sm:grid-cols-[2fr_1fr_1.5fr_1fr_auto_auto] sm:items-center sm:gap-3", overdue && "bg-destructive/5")}>
                <span className="font-medium">{r.title}</span>
                <span className="text-muted-foreground">{t(`actions.kind.${r.kind}`)}</span>
                <span className="truncate">
                  {r.names[r.owner_user_id] ?? "—"}
                  {r.helper_user_ids.length > 0 && <span className="text-muted-foreground"> + {r.helper_user_ids.map((h) => r.names[h] ?? "—").join(", ")}</span>}
                </span>
                <span className="truncate text-muted-foreground">{r.projectName ?? "—"}</span>
                <span className={cn("flex items-center gap-1 whitespace-nowrap", overdue ? "text-destructive" : "text-muted-foreground")}>
                  {overdue && <AlertTriangle className="h-3 w-3" aria-label={t("actions.overdue")} />}
                  {r.due_date ? new Date(r.due_date).toLocaleDateString(locale, { day: "2-digit", month: "short" }) : "—"}
                </span>
                <Badge variant={r.status === "open" ? "secondary" : "outline"}>{t(`actions.status.${r.status}`)}</Badge>
              </Link>
            );
          })}
        </Card>
      )}
      <ActionFormDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
