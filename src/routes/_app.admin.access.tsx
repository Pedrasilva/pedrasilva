import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Eye, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminOnly } from "@/components/AdminOnly";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ACCESS_CATALOGUE, ACCESS_SECTIONS, baselineLevel, currentLevel, itemKey, selectableLevels,
  type AccessItem, type AccessLevel, type AccessSection, type CurrentSources,
} from "@/lib/access/catalogue";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin/access")({
  component: AccessPage,
  head: () => ({
    meta: [
      { title: "Access preview — Portal Pedra Silva admin" },
      { name: "description", content: "Preview the new access catalogue and target access levels per person." },
      { property: "og:title", content: "Access preview — Portal Pedra Silva admin" },
      { property: "og:description", content: "Preview the new access catalogue and target access levels per person." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

interface Person {
  user_id: string;
  name: string;
  is_admin: boolean;
}

type TargetMap = Record<string, Record<string, AccessLevel>>; // user → item → level

const ORDERED = [
  ...ACCESS_CATALOGUE.filter((i) => i.tier === "confidential"),
  ...ACCESS_CATALOGUE.filter((i) => i.tier === "standard"),
];

function usePeople() {
  return useQuery({
    queryKey: ["access-preview-people"],
    queryFn: async (): Promise<Person[]> => {
      const { data, error } = await supabase.rpc("list_users_with_role_v2");
      if (error) throw error;
      return ((data ?? []) as any[])
        .filter((r) => r.collaborator_id) // excludes the test account
        .map((r) => ({ user_id: r.user_id, name: r.collaborator_nome ?? r.email, is_admin: !!r.is_admin }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

function useCurrent(people: Person[] | undefined) {
  return useQuery({
    queryKey: ["access-preview-current", people?.map((p) => p.user_id)],
    enabled: !!people,
    queryFn: async (): Promise<Record<string, CurrentSources>> => {
      const ids = people!.map((p) => p.user_id);
      const { data: v1Rows, error } = await supabase
        .from("user_permissions")
        .select("user_id, permission_key, granted")
        .in("user_id", ids)
        .eq("granted", true);
      if (error) throw error;
      const out: Record<string, CurrentSources> = {};
      await Promise.all(
        people!.map(async (p) => {
          const { data, error: e } = await (supabase as any).rpc("list_user_effective_permissions", { _user_id: p.user_id });
          if (e) throw e;
          out[p.user_id] = {
            isAdmin: p.is_admin,
            v2: ((data ?? []) as any[]).map((r) => ({ key: r.permission_key, scope: r.scope })),
            v1: (v1Rows ?? []).filter((r: any) => r.user_id === p.user_id).map((r: any) => r.permission_key),
          };
        }),
      );
      return out;
    },
  });
}

function useTargets() {
  return useQuery({
    queryKey: ["access-preview-targets"],
    queryFn: async (): Promise<TargetMap> => {
      const { data, error } = await (supabase as any).from("user_access").select("user_id, item_id, level");
      if (error) throw error;
      const map: TargetMap = {};
      for (const r of (data ?? []) as any[]) (map[r.user_id] ??= {})[r.item_id] = r.level;
      return map;
    },
  });
}

function targetOf(targets: TargetMap | undefined, userId: string, item: AccessItem): AccessLevel {
  return targets?.[userId]?.[item.id] ?? baselineLevel(item);
}

function AccessPage() {
  const { t } = useTranslation("access");
  return (
    <AdminOnly>
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("page.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("page.subtitle")}</p>
        </div>
        <Alert>
          <Eye className="h-4 w-4" />
          <AlertDescription className="font-medium">{t("page.banner")}</AlertDescription>
        </Alert>
        <AccessBody />
      </div>
    </AdminOnly>
  );
}

function AccessBody() {
  const { t } = useTranslation("access");
  const people = usePeople();
  const current = useCurrent(people.data);
  const targets = useTargets();
  const loading = people.isLoading || current.isLoading || targets.isLoading;

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (people.error || current.error || targets.error) {
    return <p className="text-sm text-destructive">{String((people.error ?? current.error ?? targets.error) as Error)}</p>;
  }
  return (
    <Tabs defaultValue="person">
      <TabsList>
        <TabsTrigger value="person">{t("page.personView")}</TabsTrigger>
        <TabsTrigger value="everyone">{t("page.everyoneView")}</TabsTrigger>
      </TabsList>
      <TabsContent value="person">
        <PersonView people={people.data!} current={current.data!} targets={targets.data!} />
      </TabsContent>
      <TabsContent value="everyone">
        <EveryoneView people={people.data!} current={current.data!} targets={targets.data!} />
      </TabsContent>
    </Tabs>
  );
}

function useSaveTargets() {
  const qc = useQueryClient();
  const { t } = useTranslation("access");
  return useMutation({
    mutationFn: async (rows: { user_id: string; item_id: string; level: AccessLevel }[]) => {
      if (!rows.length) return;
      const { error } = await (supabase as any)
        .from("user_access")
        .upsert(rows, { onConflict: "user_id,item_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["access-preview-targets"] });
      toast.success(t("page.saved"));
    },
    onError: (e: Error) => toast.error(`${t("page.saveError")}: ${e.message}`),
  });
}

function PersonView({ people, current, targets }: { people: Person[]; current: Record<string, CurrentSources>; targets: TargetMap }) {
  const { t } = useTranslation("access");
  const [selected, setSelected] = useState<string>(people.find((p) => !p.is_admin)?.user_id ?? people[0]?.user_id ?? "");
  const [copySource, setCopySource] = useState<string | null>(null);
  const save = useSaveTargets();
  const person = people.find((p) => p.user_id === selected);

  const copyChanges = useMemo(() => {
    if (!copySource || !person) return [];
    return ACCESS_CATALOGUE.map((item) => ({
      item,
      from: targetOf(targets, person.user_id, item),
      to: targetOf(targets, copySource, item),
    })).filter((c) => c.from !== c.to);
  }, [copySource, person, targets]);

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="w-72" aria-label={t("page.pickPerson")}>
            <SelectValue placeholder={t("page.pickPerson")} />
          </SelectTrigger>
          <SelectContent>
            {people.map((p) => (
              <SelectItem key={p.user_id} value={p.user_id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {person && (
          <Select value="" onValueChange={(v) => setCopySource(v)}>
            <SelectTrigger className="w-60" aria-label={t("page.copyFrom")}>
              <Copy className="mr-2 h-4 w-4" />
              <SelectValue placeholder={t("page.copyFrom")} />
            </SelectTrigger>
            <SelectContent>
              {people.filter((p) => p.user_id !== selected).map((p) => (
                <SelectItem key={p.user_id} value={p.user_id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {person?.is_admin && <p className="text-sm text-muted-foreground">{t("page.admin")}</p>}

      {person && (
        <div className="grid gap-4 lg:grid-cols-2">
          {ACCESS_SECTIONS.map((section) => {
            const items = ORDERED.filter((i) => i.section === section);
            if (!items.length) return null;
            return (
              <Card key={section}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{t(`section.${section}`)}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {items.map((item) => {
                    const target = targetOf(targets, person.user_id, item);
                    const today = currentLevel(item, current[person.user_id]);
                    const differsDefault = target !== baselineLevel(item);
                    const differsToday = target !== today;
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "flex items-start justify-between gap-3 rounded-md border p-2",
                          differsDefault && "border-primary/50 bg-primary/5",
                        )}
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                            {t(`items.${itemKey(item.id)}.label`)}
                            <Badge variant={item.tier === "confidential" ? "secondary" : "outline"} className="text-[10px]">
                              {t(`tier.${item.tier}`)}
                            </Badge>
                            {differsDefault && (
                              <span className="text-[10px] text-primary">{t("page.differsFromDefault")}</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{t(`items.${itemKey(item.id)}.description`)}</p>
                          <p className={cn("text-xs", differsToday ? "font-medium text-foreground" : "text-muted-foreground")}>
                            {t("page.today")}: {t(`level.${today}`)} · {t("page.target")}: {t(`level.${target}`)}
                          </p>
                        </div>
                        <Select
                          value={target}
                          onValueChange={(v) =>
                            save.mutate([{ user_id: person.user_id, item_id: item.id, level: v as AccessLevel }])
                          }
                        >
                          <SelectTrigger className="h-8 w-28 shrink-0" aria-label={t(`items.${itemKey(item.id)}.label`)}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {selectableLevels(item).map((l) => (
                              <SelectItem key={l} value={l}>{t(`level.${l}`)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!copySource} onOpenChange={(o) => !o && setCopySource(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("page.copyTitle", { name: people.find((p) => p.user_id === copySource)?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {copyChanges.length ? t("page.copyDesc", { target: person?.name ?? "" }) : t("page.copyNone")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {copyChanges.length > 0 && (
            <ul className="max-h-64 space-y-1 overflow-auto text-sm">
              {copyChanges.map((c) => (
                <li key={c.item.id}>
                  {t(`items.${itemKey(c.item.id)}.label`)}: {t(`level.${c.from}`)} → <strong>{t(`level.${c.to}`)}</strong>
                </li>
              ))}
            </ul>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{t("page.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!copyChanges.length}
              onClick={() => {
                if (!person) return;
                save.mutate(copyChanges.map((c) => ({ user_id: person.user_id, item_id: c.item.id, level: c.to })));
                setCopySource(null);
              }}
            >
              {t("page.copyConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EveryoneView({ people, current, targets }: { people: Person[]; current: Record<string, CurrentSources>; targets: TargetMap }) {
  const { t } = useTranslation("access");
  const [section, setSection] = useState<AccessSection | "all">("all");
  const items = ORDERED.filter((i) => section === "all" || i.section === section);

  return (
    <div className="space-y-3 pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={section} onValueChange={(v) => setSection(v as AccessSection | "all")}>
          <SelectTrigger className="w-56" aria-label={t("page.sectionFilter")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("page.allSections")}</SelectItem>
            {ACCESS_SECTIONS.map((s) => (
              <SelectItem key={s} value={s}>{t(`section.${s}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{t("page.legendTodayTarget")}</span>
      </div>
      <div className="overflow-auto rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="sticky left-0 z-10 bg-muted p-2 text-left font-medium">{t("page.person")}</th>
              {items.map((i) => (
                <th key={i.id} className="min-w-24 p-2 text-left align-bottom font-medium">
                  <div>{t(`items.${itemKey(i.id)}.label`)}</div>
                  <div className="font-normal text-muted-foreground">{t(`tier.${i.tier}`)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.user_id} className="border-t">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-background p-2 font-medium">
                  {p.name}{p.is_admin ? " · Admin" : ""}
                </td>
                {items.map((i) => {
                  const target = targetOf(targets, p.user_id, i);
                  const today = currentLevel(i, current[p.user_id]);
                  const diff = today !== target;
                  return (
                    <td
                      key={i.id}
                      className={cn(
                        "whitespace-nowrap p-2",
                        target !== baselineLevel(i) && "bg-primary/5",
                        diff && "font-semibold text-primary",
                      )}
                      title={diff ? t("page.differsFromToday") : undefined}
                    >
                      {diff ? `${t(`level.${today}`)} → ${t(`level.${target}`)}` : t(`level.${target}`)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
