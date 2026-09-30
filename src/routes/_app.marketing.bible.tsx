import { ModuleSubnav } from "@/components/shell/ModuleSubnav";
import { createFileRoute, useBlocker } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, History, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyPermissionsV2 } from "@/hooks/use-permissions-v2";
import { V2PermissionGate } from "@/components/PermissionGate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Markdown } from "@/components/marketing/markdown";
import {
  BIBLE_QUERY_KEY,
  toSnakeKey,
  useBibleVersions,
  type BiblePersona,
  type BiblePillar,
  type BibleVersion,
} from "@/lib/marketing/bible";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/marketing/bible")({
  component: () => (
    <V2PermissionGate permission="marketing.view" scope="own">
      <BiblePage />
    </V2PermissionGate>
  ),
  head: () => ({
    meta: [
      { title: "Marketing Bible — Portal Pedra Silva" },
      { name: "description", content: "Studio marketing strategy: positioning, personas, content pillars and voice." },
      { property: "og:title", content: "Marketing Bible — Portal Pedra Silva" },
      { property: "og:description", content: "Studio marketing strategy: positioning, personas, content pillars and voice." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const PERSONA_FIELDS = ["who", "wants", "fears", "finds_us", "wins_them"] as const;

function useAuthorNames(ids: string[]) {
  const key = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ["marketing-bible-authors", key],
    enabled: key.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.rpc("list_collaborators_basic");
      const map: Record<string, string> = {};
      await Promise.all(
        (data ?? []).map(async (c) => {
          const { data: uid } = await supabase.rpc("get_user_id_for_collaborator", { p_collaborator_id: c.id });
          if (uid && key.includes(uid)) map[uid] = c.nome;
        }),
      );
      return map;
    },
  });
}

function BiblePage() {
  const { t } = useTranslation("marketing");
  const { user } = useAuth();
  const { can } = useMyPermissionsV2();
  const canEdit = can("marketing.edit_bible", "all");
  const qc = useQueryClient();
  const { data: versions = [], isLoading } = useBibleVersions();
  const active = versions[0] ?? null;
  const [viewing, setViewing] = useState<number | null>(null);
  const [editing, setEditing] = useState<BibleVersion | "new" | null>(null);
  const shown = viewing != null ? versions.find((v) => v.version === viewing) ?? active : active;
  const isOld = !!shown && !!active && shown.version !== active.version;
  const { data: names = {} } = useAuthorNames(versions.map((v) => v.created_by));
  const author = (id: string) => (id === user?.id ? t("bible.you") : names[id] ?? t("bible.unknownAuthor"));

  const insert = async (payload: Pick<BibleVersion, "content_md" | "pillars" | "personas" | "change_summary">) => {
    const { error } = await supabase.from("marketing_bible_versions").insert(payload as never);
    if (error) {
      toast.error(t("bible.saveError"), { description: error.message });
      return false;
    }
    toast.success(t("bible.saved"));
    await qc.invalidateQueries({ queryKey: BIBLE_QUERY_KEY });
    setViewing(null);
    return true;
  };

  const restore = async (v: BibleVersion) => {
    await insert({
      content_md: v.content_md,
      pillars: v.pillars,
      personas: v.personas,
      change_summary: t("bible.restoredFrom", { version: v.version }),
    });
  };

  if (editing) {
    return (
      <BibleEditor
        initial={editing === "new" ? null : editing}
        onCancel={() => setEditing(null)}
        onSave={async (p) => {
          const ok = await insert(p);
          if (ok) setEditing(null);
          return ok;
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("bible.title")}</h1>
          {active && (
            <p className="text-sm text-muted-foreground">
              {t("bible.activeMeta", {
                version: active.version,
                author: author(active.created_by),
                date: new Date(active.created_at).toLocaleString(),
              })}
              {" — "}
              {active.change_summary}
            </p>
          )}
        </div>
        {canEdit && active && !isOld && (
          <Button onClick={() => setEditing(active)}>
            <Pencil className="mr-1 h-4 w-4" /> {t("bible.edit")}
          </Button>
        )}
      </div>
      <ModuleSubnav moduleId="marketing" />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("inbox.loading")}</p>
      ) : !active ? (
        <Card className="space-y-3 p-10 text-center">
          <p className="text-sm text-muted-foreground">{t("bible.empty")}</p>
          {canEdit && (
            <Button onClick={() => setEditing("new")}>
              <Plus className="mr-1 h-4 w-4" /> {t("bible.createFirst")}
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0 space-y-5">
            {isOld && shown && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                <span>{t("bible.viewingOld", { version: shown.version })}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setViewing(null)}>{t("bible.backToActive")}</Button>
                  {canEdit && (
                    <Button size="sm" onClick={() => restore(shown)}>
                      <RotateCcw className="mr-1 h-4 w-4" /> {t("bible.restore")}
                    </Button>
                  )}
                </div>
              </div>
            )}
            {shown && <BibleBody v={shown} />}
          </div>
          <Card className="h-fit p-3">
            <h2 className="mb-2 flex items-center gap-1 text-sm font-semibold">
              <History className="h-4 w-4" /> {t("bible.history")}
            </h2>
            <ul className="space-y-1">
              {versions.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => setViewing(v.version === active.version ? null : v.version)}
                    className={cn(
                      "w-full rounded-md p-2 text-left text-xs hover:bg-muted",
                      shown?.version === v.version && "bg-muted",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">v{v.version}</span>
                      {v.version === active.version && <Badge variant="secondary">{t("bible.active")}</Badge>}
                      <span className="ml-auto text-muted-foreground">{new Date(v.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="text-muted-foreground">{author(v.created_by)}</div>
                    <div className="line-clamp-2">{v.change_summary}</div>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}

function BibleBody({ v }: { v: Pick<BibleVersion, "content_md" | "pillars" | "personas"> }) {
  const { t } = useTranslation("marketing");
  return (
    <div className="space-y-6">
      <Card className="p-5">
        <Markdown>{v.content_md}</Markdown>
      </Card>
      {v.pillars.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">{t("bible.pillars")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {v.pillars.map((p) => (
              <Card key={p.key} className="p-4">
                <div className="font-medium">{p.name}</div>
                {p.description && <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>}
              </Card>
            ))}
          </div>
        </section>
      )}
      {v.personas.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">{t("bible.personas")}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {v.personas.map((p) => (
              <Card key={p.key} className="space-y-2 p-4">
                <div className="font-medium">{p.name}</div>
                {PERSONA_FIELDS.map((f) =>
                  p[f] ? (
                    <div key={f} className="text-sm">
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">{t(`bible.persona.${f}`)}</span>
                      <p>{p[f]}</p>
                    </div>
                  ) : null,
                )}
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

type Draft = { content_md: string; pillars: BiblePillar[]; personas: BiblePersona[] };

function move<T>(arr: T[], i: number, d: number) {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function BibleEditor({
  initial,
  onCancel,
  onSave,
}: {
  initial: BibleVersion | null;
  onCancel: () => void;
  onSave: (p: Draft & { change_summary: string }) => Promise<boolean>;
}) {
  const { t } = useTranslation("marketing");
  const start = useMemo<Draft>(
    () => ({
      content_md: initial?.content_md ?? "",
      pillars: initial?.pillars ?? [],
      personas: initial?.personas ?? [],
    }),
    [initial],
  );
  const [d, setD] = useState<Draft>(start);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const dirty = !done && JSON.stringify(d) !== JSON.stringify(start);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
  useBlocker({ shouldBlockFn: () => dirty && !window.confirm(t("bible.unsavedConfirm")), enableBeforeUnload: false });

  const dupKeys = (arr: { key: string }[]) => {
    const seen = new Set<string>();
    return arr.some((x) => (seen.has(x.key) ? true : (seen.add(x.key), false)));
  };
  const invalid =
    !d.content_md.trim() ||
    [...d.pillars, ...d.personas].some((x) => !x.key.trim() || !x.name.trim()) ||
    dupKeys(d.pillars) ||
    dupKeys(d.personas);

  const cancel = () => {
    if (dirty && !window.confirm(t("bible.unsavedConfirm"))) return;
    setDone(true);
    onCancel();
  };

  const submit = async () => {
    setSaving(true);
    setDone(true);
    const ok = await onSave({ ...d, change_summary: summary.trim() });
    setSaving(false);
    if (!ok) setDone(false);
  };

  const setPillar = (i: number, patch: Partial<BiblePillar>) =>
    setD((s) => ({ ...s, pillars: s.pillars.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const setPersona = (i: number, patch: Partial<BiblePersona>) =>
    setD((s) => ({ ...s, personas: s.personas.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const nameChange = <T extends { key: string; name: string }>(item: T, name: string): Partial<T> =>
    ({ name, ...(!item.key || item.key === toSnakeKey(item.name) ? { key: toSnakeKey(name) } : {}) }) as Partial<T>;

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {initial ? t("bible.editingFrom", { version: initial.version }) : t("bible.createFirst")}
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={cancel}>{t("bible.cancel")}</Button>
          <Button disabled={invalid || !dirty} onClick={() => setSummaryOpen(true)}>{t("bible.saveNew")}</Button>
        </div>
      </div>
      <ModuleSubnav moduleId="marketing" />
      {invalid && <p className="text-xs text-destructive">{t("bible.invalidHint")}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">{t("bible.markdown")}</Label>
          <Textarea
            className="min-h-[520px] font-mono text-xs"
            value={d.content_md}
            onChange={(e) => setD((s) => ({ ...s, content_md: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("bible.preview")}</Label>
          <Card className="max-h-[520px] min-h-[520px] overflow-y-auto p-4">
            <Markdown>{d.content_md}</Markdown>
          </Card>
        </div>
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("bible.pillars")}</h2>
          <Button size="sm" variant="outline" onClick={() => setD((s) => ({ ...s, pillars: [...s.pillars, { key: "", name: "", description: "" }] }))}>
            <Plus className="mr-1 h-4 w-4" /> {t("bible.addPillar")}
          </Button>
        </div>
        {d.pillars.map((p, i) => (
          <Card key={i} className="grid gap-2 p-3 md:grid-cols-[1fr_1fr_2fr_auto]">
            <Input placeholder={t("bible.name")} value={p.name} onChange={(e) => setPillar(i, nameChange(p, e.target.value))} />
            <Input placeholder={t("bible.key")} value={p.key} onChange={(e) => setPillar(i, { key: toSnakeKey(e.target.value) })} />
            <Input placeholder={t("bible.description")} value={p.description ?? ""} onChange={(e) => setPillar(i, { description: e.target.value })} />
            <RowActions
              onUp={() => setD((s) => ({ ...s, pillars: move(s.pillars, i, -1) }))}
              onDown={() => setD((s) => ({ ...s, pillars: move(s.pillars, i, 1) }))}
              onRemove={() => setD((s) => ({ ...s, pillars: s.pillars.filter((_, j) => j !== i) }))}
            />
          </Card>
        ))}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("bible.personas")}</h2>
          <Button size="sm" variant="outline" onClick={() => setD((s) => ({ ...s, personas: [...s.personas, { key: "", name: "" }] }))}>
            <Plus className="mr-1 h-4 w-4" /> {t("bible.addPersona")}
          </Button>
        </div>
        {d.personas.map((p, i) => (
          <Card key={i} className="space-y-2 p-3">
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
              <Input placeholder={t("bible.name")} value={p.name} onChange={(e) => setPersona(i, nameChange(p, e.target.value))} />
              <Input placeholder={t("bible.key")} value={p.key} onChange={(e) => setPersona(i, { key: toSnakeKey(e.target.value) })} />
              <RowActions
                onUp={() => setD((s) => ({ ...s, personas: move(s.personas, i, -1) }))}
                onDown={() => setD((s) => ({ ...s, personas: move(s.personas, i, 1) }))}
                onRemove={() => setD((s) => ({ ...s, personas: s.personas.filter((_, j) => j !== i) }))}
              />
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {PERSONA_FIELDS.map((f) => (
                <div key={f} className="space-y-1">
                  <Label className="text-xs">{t(`bible.persona.${f}`)}</Label>
                  <Textarea rows={2} value={p[f] ?? ""} onChange={(e) => setPersona(i, { [f]: e.target.value })} />
                </div>
              ))}
            </div>
          </Card>
        ))}
      </section>

      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("bible.saveNew")}</DialogTitle></DialogHeader>
          <div className="space-y-1">
            <Label className="text-xs">{t("bible.changeSummary")}</Label>
            <Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder={t("bible.changeSummaryHint")} />
          </div>
          <DialogFooter>
            <Button disabled={saving || !summary.trim()} onClick={submit}>{t("bible.saveNew")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RowActions({ onUp, onDown, onRemove }: { onUp: () => void; onDown: () => void; onRemove: () => void }) {
  return (
    <div className="flex gap-1">
      <Button size="icon" variant="ghost" onClick={onUp}><ArrowUp className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" onClick={onDown}><ArrowDown className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" onClick={onRemove}><Trash2 className="h-4 w-4" /></Button>
    </div>
  );
}
