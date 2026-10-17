import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AdminOnly } from "@/components/AdminOnly";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { readGanttSchedule, saveGanttSchedule } from "@/lib/projects/gantt-schedule";
import { reflowForCalendar, type ScheduleState } from "@/lib/projects/schedule-engine";

export const Route = createFileRoute("/_app/admin/calendar")({
  head: () => ({ meta: [
    { title: "Calendário do atelier · PSA Hub" },
    { name: "description", content: "Public holidays and office closures used as the shared working-day calendar in PSA Hub." },
    { property: "og:title", content: "Calendário do atelier · PSA Hub" },
    { property: "og:description", content: "Public holidays and office closures used as the shared working-day calendar in PSA Hub." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => (<AdminOnly><OfficeCalendarPage /></AdminOnly>),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Holiday = { id: string; data: string; nome: string; tipo: string; office_closure_id: string | null };
type Closure = { id: string; name: string; start_date: string; end_date: string; repeats_yearly: boolean };
type LeaveRow = { collaborator_id: string; name: string; day: string; closure_name: string; action: string; days: number; insufficient: boolean };
type Plan = { token: string; holidays_add: unknown[]; holidays_remove: unknown[]; leave: LeaveRow[] };

async function allHolidayDates(): Promise<string[]> {
  const { data, error } = await db.from("holidays").select("data");
  if (error) throw error;
  return (data ?? []).map((h: { data: string }) => h.data);
}

function OfficeCalendarPage() {
  const { t } = useTranslation("projects");
  const qc = useQueryClient();
  const [year, setYear] = useState(new Date().getFullYear());
  const [review, setReview] = useState<string[] | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);

  const holidaysQ = useQuery({ queryKey: ["office-cal-holidays", year], queryFn: async (): Promise<Holiday[]> => {
    const { data, error } = await db.from("holidays").select("id,data,nome,tipo,office_closure_id").gte("data", `${year}-01-01`).lte("data", `${year}-12-31`).order("data");
    if (error) throw error; return data ?? [];
  } });
  const closuresQ = useQuery({ queryKey: ["office-closures"], queryFn: async (): Promise<Closure[]> => {
    const { data, error } = await db.from("office_closures").select("*").order("start_date");
    if (error) throw error; return data ?? [];
  } });
  const peopleQ = useQuery({ queryKey: ["office-cal-people"], queryFn: async () => {
    const { data, error } = await db.from("collaborators").select("id,nome,ferias_entitled").is("archived_at", null).order("nome");
    if (error) throw error; return (data ?? []) as Array<{ id: string; nome: string; ferias_entitled: boolean }>;
  } });
  const refresh = () => { for (const k of ["office-cal-holidays","office-closures","office-cal-people","gantt-holidays","non-working-days"]) qc.invalidateQueries({ queryKey: [k] }); };
  const fail = (e: unknown) => { const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e); toast.error(t(m, { defaultValue: m })); };

  const [hDate, setHDate] = useState(""); const [hName, setHName] = useState(""); const [hTipo, setHTipo] = useState("nacional");
  const saveHoliday = useMutation({ mutationFn: async () => {
    const before = await allHolidayDates();
    const { error } = await db.from("holidays").upsert({ data: hDate, nome: hName, tipo: hTipo, office_closure_id: null }, { onConflict: "data" });
    if (error) throw error; return before;
  }, onSuccess: (before) => { setHDate(""); setHName(""); refresh(); setReview(before); }, onError: fail });
  const deleteHoliday = useMutation({ mutationFn: async (id: string) => {
    const before = await allHolidayDates();
    const { error } = await db.from("holidays").delete().eq("id", id); if (error) throw error; return before;
  }, onSuccess: (before) => { refresh(); setReview(before); }, onError: fail });

  const [draft, setDraft] = useState<Partial<Closure>>({ repeats_yearly: false });
  const saveClosure = useMutation({ mutationFn: async () => {
    const row = { name: draft.name, start_date: draft.start_date, end_date: draft.end_date, repeats_yearly: !!draft.repeats_yearly };
    const { error } = draft.id ? await db.from("office_closures").update(row).eq("id", draft.id) : await db.from("office_closures").insert(row);
    if (error) throw error;
  }, onSuccess: async () => { setDraft({ repeats_yearly: false }); refresh(); await openPlan(); }, onError: fail });
  const deleteClosure = useMutation({ mutationFn: async (id: string) => {
    const { error } = await db.from("office_closures").delete().eq("id", id); if (error) throw error;
  }, onSuccess: async () => { refresh(); await openPlan(); }, onError: fail });
  const toggleEntitled = useMutation({ mutationFn: async (a: { id: string; v: boolean }) => {
    const { error } = await db.from("collaborators").update({ ferias_entitled: a.v }).eq("id", a.id); if (error) throw error;
  }, onSuccess: refresh, onError: fail });

  async function openPlan() {
    const { data, error } = await db.rpc("pm_office_calendar_plan");
    if (error) return fail(error);
    setPlan(data as Plan);
  }
  const applyPlan = useMutation({ mutationFn: async () => {
    const before = await allHolidayDates();
    const { error } = await db.rpc("pm_office_calendar_apply", { _token: plan?.token });
    if (error) throw error; return before;
  }, onSuccess: (before) => { setPlan(null); refresh(); toast.success(t("officeCalendar.applied")); setReview(before); }, onError: fail });

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("officeCalendar.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("officeCalendar.subtitle")}</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div><CardTitle>{t("officeCalendar.holidays.title")}</CardTitle><CardDescription>{t("officeCalendar.holidays.sub")}</CardDescription></div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setYear(year - 1)}>‹</Button>
            <span className="w-12 text-center font-medium">{year}</span>
            <Button variant="outline" size="sm" onClick={() => setYear(year + 1)}>›</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="divide-y text-sm">
            {(holidaysQ.data ?? []).map((h) => (
              <li key={h.id} className="flex items-center justify-between py-1.5">
                <span><span className="tabular-nums">{h.data}</span> · {h.nome}{" "}
                  <Badge variant="secondary">{t(`officeCalendar.kind.${h.tipo}`, { defaultValue: h.tipo })}</Badge></span>
                {!h.office_closure_id && <Button variant="ghost" size="sm" onClick={() => deleteHoliday.mutate(h.id)}>{t("officeCalendar.remove")}</Button>}
              </li>
            ))}
            {holidaysQ.data?.length === 0 && <li className="py-2 text-muted-foreground">{t("officeCalendar.holidays.empty")}</li>}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Input type="date" value={hDate} onChange={(e) => setHDate(e.target.value)} className="w-40" />
            <Input placeholder={t("officeCalendar.name")} value={hName} onChange={(e) => setHName(e.target.value)} className="w-56" />
            <select className="rounded-md border bg-background px-2 text-sm" value={hTipo} onChange={(e) => setHTipo(e.target.value)}>
              <option value="nacional">{t("officeCalendar.kind.nacional")}</option>
              <option value="municipal_lisboa">{t("officeCalendar.kind.municipal_lisboa")}</option>
            </select>
            <Button disabled={!hDate || !hName || saveHoliday.isPending} onClick={() => saveHoliday.mutate()}>{t("officeCalendar.save")}</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("officeCalendar.closures.title")}</CardTitle><CardDescription>{t("officeCalendar.closures.sub")}</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <ul className="divide-y text-sm">
            {(closuresQ.data ?? []).map((c) => (
              <li key={c.id} className="flex items-center justify-between py-1.5">
                <span>{c.name} · <span className="tabular-nums">{c.start_date} → {c.end_date}</span>{c.repeats_yearly && <> <Badge variant="secondary">{t("officeCalendar.closures.yearly")}</Badge></>}</span>
                <span className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setDraft(c)}>{t("officeCalendar.edit")}</Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteClosure.mutate(c.id)}>{t("officeCalendar.remove")}</Button>
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Input placeholder={t("officeCalendar.name")} value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-56" />
            <Input type="date" value={draft.start_date ?? ""} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} className="w-40" />
            <Input type="date" value={draft.end_date ?? ""} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} className="w-40" />
            <label className="flex items-center gap-2 text-sm"><Switch checked={!!draft.repeats_yearly} onCheckedChange={(v) => setDraft({ ...draft, repeats_yearly: v })} />{t("officeCalendar.closures.yearly")}</label>
            <Button disabled={!draft.name || !draft.start_date || !draft.end_date || saveClosure.isPending} onClick={() => saveClosure.mutate()}>{t("officeCalendar.save")}</Button>
            <Button variant="outline" onClick={openPlan}>{t("officeCalendar.preview")}</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("officeCalendar.entitled.title")}</CardTitle><CardDescription>{t("officeCalendar.entitled.sub")}</CardDescription></CardHeader>
        <CardContent className="grid gap-1 sm:grid-cols-2">
          {(peopleQ.data ?? []).map((p) => (
            <label key={p.id} className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-muted">
              {p.nome}<Switch checked={p.ferias_entitled} onCheckedChange={(v) => toggleEntitled.mutate({ id: p.id, v })} />
            </label>
          ))}
        </CardContent>
      </Card>

      {plan && <PlanDialog plan={plan} pending={applyPlan.isPending} onClose={() => setPlan(null)} onApply={() => applyPlan.mutate()} />}
      {review && <LiveProjectsReview oldHolidays={review} onClose={() => setReview(null)} />}
    </div>
  );
}

function PlanDialog({ plan, pending, onClose, onApply }: { plan: Plan; pending: boolean; onClose: () => void; onApply: () => void }) {
  const { t } = useTranslation("projects");
  const people = useMemo(() => {
    const m = new Map<string, { name: string; deduct: number; deductDays: string[]; refund: number; skipped: Record<string, number>; insufficient: boolean }>();
    for (const l of plan.leave) {
      const p = m.get(l.collaborator_id) ?? { name: l.name, deduct: 0, deductDays: [], refund: 0, skipped: {}, insufficient: false };
      if (l.action === "deduct") { p.deduct += Number(l.days); p.deductDays.push(l.day); p.insufficient ||= l.insufficient; }
      else if (l.action === "refund") p.refund += Number(l.days);
      else p.skipped[l.action] = (p.skipped[l.action] ?? 0) + 1;
      m.set(l.collaborator_id, p);
    }
    return [...m.values()];
  }, [plan]);
  const nothing = !plan.leave.length && !plan.holidays_add.length && !plan.holidays_remove.length;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{t("officeCalendar.plan.title")}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{t("officeCalendar.plan.days", { add: plan.holidays_add.length, remove: plan.holidays_remove.length })}</p>
        {nothing ? <p className="text-sm">{t("officeCalendar.plan.nothing")}</p> : (
          <div className="max-h-[50vh] overflow-auto text-sm">
            <table className="w-full">
              <thead className="text-left text-muted-foreground"><tr><th>{t("officeCalendar.plan.person")}</th><th>{t("officeCalendar.plan.deduct")}</th><th>{t("officeCalendar.plan.refund")}</th><th>{t("officeCalendar.plan.skipped")}</th></tr></thead>
              <tbody>{people.map((p) => (
                <tr key={p.name} className="border-t align-top">
                  <td className="py-1">{p.name}{p.insufficient && <> <Badge variant="destructive">{t("officeCalendar.plan.insufficient")}</Badge></>}</td>
                  <td title={p.deductDays.join(", ")}>{p.deduct ? `${p.deduct} ${t("officeCalendar.plan.daysUnit")}` : "—"}</td>
                  <td>{p.refund ? `${p.refund} ${t("officeCalendar.plan.daysUnit")}` : "—"}</td>
                  <td className="text-muted-foreground">{Object.entries(p.skipped).map(([k, n]) => `${t(`officeCalendar.plan.${k}`)} ${n}`).join(" · ") || "—"}</td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("officeCalendar.cancel")}</Button>
          <Button disabled={nothing || pending} onClick={onApply}>{t("officeCalendar.plan.apply")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ProjectReview = { id: string; name: string; state?: ScheduleState; result?: ReturnType<typeof reflowForCalendar>; error?: string };
function LiveProjectsReview({ oldHolidays, onClose }: { oldHolidays: string[]; onClose: () => void }) {
  const { t } = useTranslation("projects");
  const qc = useQueryClient();
  const reviewQ = useQuery({ queryKey: ["office-cal-review", oldHolidays.length, oldHolidays.join()], queryFn: async (): Promise<ProjectReview[]> => {
    const { data, error } = await db.from("pm_projects").select("id,name").eq("status", "active").order("name");
    if (error) throw error;
    const out: ProjectReview[] = [];
    for (const p of data ?? []) {
      try {
        const state = await readGanttSchedule("project", p.id);
        const result = reflowForCalendar(state, oldHolidays);
        if (result.moves.length || result.blocked.length) out.push({ id: p.id, name: p.name, state, result });
      } catch (e) { out.push({ id: p.id, name: p.name, error: (e as Error).message }); }
    }
    return out;
  } });
  const apply = useMutation({ mutationFn: async () => {
    let ok = 0; const failed: string[] = [];
    for (const r of reviewQ.data ?? []) {
      if (!r.state || !r.result || r.result.blocked.length || !r.result.patch.stages.length) continue;
      try { await saveGanttSchedule("project", r.id, r.state, r.result.patch); ok++; }
      catch (e) { failed.push(`${r.name}: ${t((e as Error).message, { defaultValue: (e as Error).message })}`); }
    }
    return { ok, failed };
  }, onSuccess: ({ ok, failed }) => {
    toast.success(t("officeCalendar.live.applied", { count: ok }));
    if (failed.length) toast.error(failed.join("\n"));
    for (const k of ["pm-project","pm-stages-all","pm-allocations-all"]) qc.invalidateQueries({ queryKey: [k] });
    onClose();
  } });
  const rows = reviewQ.data ?? [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{t("officeCalendar.live.title")}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{t("officeCalendar.live.sub")}</p>
        {reviewQ.isLoading ? <p className="text-sm">{t("officeCalendar.live.loading")}</p> : rows.length === 0 ? <p className="text-sm">{t("officeCalendar.live.none")}</p> : (
          <div className="max-h-[50vh] space-y-3 overflow-auto text-sm">
            {rows.map((r) => (
              <div key={r.id}>
                <div className="font-medium">{r.name}</div>
                {r.error && <div className="text-destructive">{t(r.error, { defaultValue: r.error })}</div>}
                {r.result?.blocked.length ? <div className="text-destructive">{t("officeCalendar.live.blocked", { count: r.result.blocked.length })}</div> : null}
                <ul className="ml-4 list-disc text-muted-foreground">
                  {r.result?.moves.map((m) => <li key={m.id}>{m.name}: {t("officeCalendar.live.move", { start: m.startShift, end: m.endShift })}</li>)}
                </ul>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("officeCalendar.live.keep")}</Button>
          <Button disabled={!rows.some((r) => r.result?.patch.stages.length && !r.result.blocked.length) || apply.isPending} onClick={() => apply.mutate()}>{t("officeCalendar.live.apply")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
