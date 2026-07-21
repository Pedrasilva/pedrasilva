import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Lock, Mic, Trash2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useProjectNotes, useDeleteProjectNote, type ProjectNote, type NoteCategory } from "@/lib/projects/use-project-notes";
import { useAuth } from "@/hooks/use-auth";
import { CollaboratorAvatar } from "@/components/CollaboratorAvatar";
import { cn } from "@/lib/utils";

const CATEGORY_COLORS: Record<NoteCategory, string> = {
  client_request: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  todo: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  issue_risk: "bg-red-500/10 text-red-700 dark:text-red-300",
  decision_fact: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  project: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  engineering: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
  status: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  other: "bg-muted text-muted-foreground",
};

interface Props {
  projectId: string;
}

export function NotesList({ projectId }: Props) {
  const { t } = useTranslation("projects");
  const { data: notes, isLoading } = useProjectNotes(projectId);
  const del = useDeleteProjectNote(projectId);
  const { user, isAdmin } = useAuth();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<NoteCategory | "all">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (notes ?? []).filter((n) => {
      if (filter !== "all" && n.category !== filter) return false;
      if (!q) return true;
      return (
        n.body.toLowerCase().includes(q) ||
        (n.title ?? "").toLowerCase().includes(q)
      );
    });
  }, [notes, query, filter]);

  const grouped = useMemo(() => {
    const g = new Map<string, ProjectNote[]>();
    for (const n of filtered) {
      const key = format(new Date(n.created_at), "MMMM yyyy");
      const arr = g.get(key) ?? [];
      arr.push(n);
      g.set(key, arr);
    }
    return Array.from(g.entries());
  }, [filtered]);

  const categories: (NoteCategory | "all")[] = [
    "all",
    "client_request",
    "todo",
    "issue_risk",
    "decision_fact",
    "project",
    "engineering",
    "status",
    "other",
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("notes.searchPlaceholder", "Search notes…")}
            className="pl-7"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setFilter(c)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-xs transition-colors",
                filter === c
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              {c === "all" ? t("notes.filterAll", "All") : t(`notes.category.${c}`)}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {t("notes.loading", "Loading notes…")}
        </div>
      )}
      {!isLoading && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {t("notes.empty", "No notes yet — add the first one above.")}
        </div>
      )}

      {grouped.map(([month, items]) => (
        <div key={month}>
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {month}
          </div>
          <div className="space-y-2">
            {items.map((n) => {
              const canDelete = isAdmin || n.author_id === user?.id;
              const entities = (n.entities ?? {}) as {
                people?: string[];
                materials?: string[];
              };
              return (
                <article
                  key={n.id}
                  className="rounded-lg border border-border bg-card p-3"
                >
                  <div className="flex items-start gap-3">
                    <CollaboratorAvatar userId={n.author_id ?? undefined} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge className={CATEGORY_COLORS[n.category as NoteCategory]} variant="outline">
                          {t(`notes.category.${n.category}`)}
                        </Badge>
                        {n.confidential && (
                          <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-300">
                            <Lock className="h-3 w-3" />
                            {t("notes.confidential", "Confidential")}
                          </Badge>
                        )}
                        {n.source === "voice" && (
                          <Badge variant="outline" className="gap-1">
                            <Mic className="h-3 w-3" />
                            {t("notes.voice", "Voice")}
                          </Badge>
                        )}
                        <span className="text-muted-foreground">
                          {format(new Date(n.created_at), "d MMM · HH:mm")}
                        </span>
                        {n.event_date && (
                          <span className="text-muted-foreground">
                            · {t("notes.eventOn", "event")} {n.event_date}
                          </span>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="ml-auto h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              if (confirm(t("notes.confirmDelete", "Delete this note?"))) {
                                del.mutate(n.id);
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      {n.title && (
                        <div className="mt-1 text-sm font-medium">{n.title}</div>
                      )}
                      <div className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">
                        {n.body}
                      </div>
                      {(entities.people?.length || entities.materials?.length) ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {entities.people?.map((p) => (
                            <Badge key={`p-${p}`} variant="secondary" className="text-[10px]">@{p}</Badge>
                          ))}
                          {entities.materials?.map((m) => (
                            <Badge key={`m-${m}`} variant="secondary" className="text-[10px]">{m}</Badge>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
