import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, CheckCircle2, ChevronRight, Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useModuleAccess } from "@/lib/module-access";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RestrictedCard } from "@/components/PermissionGate";
import { NoteComposer } from "@/components/projects/notes/note-composer";

export const Route = createFileRoute("/m/note")({
  component: MobileNote,
  head: () => ({
    meta: [
      { title: "Nota de projeto — Portal Pedra Silva" },
      { name: "description", content: "Record a voice note on a project from your phone." },
      { property: "og:title", content: "Nota de projeto — Portal Pedra Silva" },
      { property: "og:description", content: "Record a voice note on a project from your phone." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Proj = { id: string; name: string; client: string | null };
const RECENT_KEY = "psa.m.recentNoteProjects";

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 5) : [];
  } catch { return []; }
}
function pushRecent(id: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...readRecent().filter((x) => x !== id)].slice(0, 5)));
  } catch { /* storage unavailable */ }
}

function MobileNote() {
  const { t } = useTranslation("common");
  const { user } = useAuth();
  const { canAccess, loading: accessLoading } = useModuleAccess();
  const [q, setQ] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [project, setProject] = useState<Proj | null>(null);
  const [saved, setSaved] = useState(false);
  const [composerKey, setComposerKey] = useState(0);

  useEffect(() => setRecent(readRecent()), []);

  const projectsQ = useQuery({
    queryKey: ["m-note-projects", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const [{ data: all, error }, { data: mine }] = await Promise.all([
        supabase.from("pm_projects").select("id, name, client, status").order("name"),
        supabase.rpc("pm_assigned_project_ids", { _user_id: user!.id }),
      ]);
      if (error) throw error;
      const mineIds = new Set(((mine ?? []) as { project_id: string }[]).map((r) => r.project_id));
      return { all: (all ?? []) as (Proj & { status: string })[], mineIds };
    },
  });

  const all = projectsQ.data?.all ?? [];
  const byId = useMemo(() => new Map(all.map((p) => [p.id, p])), [all]);
  const recentList = recent.map((id) => byId.get(id)).filter(Boolean) as Proj[];
  const mineList = all.filter((p) => projectsQ.data?.mineIds.has(p.id));
  const term = q.trim().toLowerCase();
  const results = term
    ? all.filter((p) => p.name.toLowerCase().includes(term) || (p.client ?? "").toLowerCase().includes(term)).slice(0, 30)
    : [];

  if (!accessLoading && !canAccess("projects")) return <RestrictedCard />;

  if (project) {
    return (
      <div className="flex flex-col gap-4">
        <div className="sticky top-0 z-10 -mx-4 flex min-h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur">
          <span className="min-w-0 flex-1 truncate font-semibold">{project.name}</span>
          <button type="button" className="min-h-12 px-2 text-sm font-medium text-primary"
            onClick={() => { setProject(null); setSaved(false); }}>
            {t("mobile.change")}
          </button>
        </div>
        {saved ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <CheckCircle2 className="h-14 w-14 text-success" />
            <p className="text-lg font-semibold">{t("mobile.savedIn", { project: project.name })}</p>
            <Button className="min-h-14 w-full text-base" onClick={() => { setSaved(false); setComposerKey((k) => k + 1); }}>
              {t("mobile.anotherNote")}
            </Button>
            <Button asChild variant="outline" className="min-h-14 w-full text-base">
              <Link to="/m">{t("mobile.backHome")}</Link>
            </Button>
          </div>
        ) : (
          <NoteComposer key={composerKey} projectId={project.id} variant="quick"
            onSaved={() => { pushRecent(project.id); setRecent(readRecent()); setSaved(true); }} />
        )}
      </div>
    );
  }

  const Row = ({ p }: { p: Proj }) => (
    <li>
      <button type="button" onClick={() => setProject(p)}
        className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{p.name}</span>
          {p.client && <span className="block truncate text-xs text-muted-foreground">{p.client}</span>}
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
      </button>
    </li>
  );

  return (
    <div className="flex flex-col gap-4">
      <Link to="/m" className="flex min-h-12 items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" />{t("mobile.back")}
      </Link>
      <h1 className="text-2xl font-semibold">{t("mobile.note")}</h1>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("mobile.searchProjects")}
          className="h-12 pl-9 text-base" />
      </div>
      {projectsQ.isLoading ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
      ) : term ? (
        results.length ? <ul className="flex flex-col gap-2">{results.map((p) => <Row key={p.id} p={p} />)}</ul>
          : <p className="text-sm text-muted-foreground">{t("mobile.noProjects")}</p>
      ) : (
        <>
          {recentList.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("mobile.recent")}</h2>
              <ul className="flex flex-col gap-2">{recentList.map((p) => <Row key={p.id} p={p} />)}</ul>
            </section>
          )}
          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("mobile.myProjects")}</h2>
            {mineList.length
              ? <ul className="flex flex-col gap-2">{mineList.map((p) => <Row key={p.id} p={p} />)}</ul>
              : <p className="text-sm text-muted-foreground">{t("mobile.noMyProjects")}</p>}
          </section>
        </>
      )}
    </div>
  );
}
