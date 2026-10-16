import { useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { format, parseISO } from "date-fns";
import { MapPin, AlertTriangle, Users, Briefcase, PanelLeft, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { dailyHours, deriveSlots, resourceSlotCounts, weekDays, type BoardData, type DerivedSlot, type DerivedBoard, type DayPart } from "@/lib/projects/week-board";

type Editing = { paint:(resource:string,day:string,part:DayPart) => void; start:() => void; finish:() => void; wholeWeek:(resource:string) => void; isDown:() => boolean; changed:Set<string> };
export function WeekPlanningBoard({ data, week, board, editing }: { data: BoardData; week: string; board?:DerivedBoard; editing?:Editing }) {
  const { t } = useTranslation("projects");
  const [view, setView] = useState("person");
  const [colour, setColour] = useState("stripe");
  const days = weekDays(week);
  const projects = new Map(data.projects.map(p => [p.id, p]));
  const derived = useMemo(() => deriveSlots(data.allocations, week, Object.fromEntries(data.resources.map(r => [r.id, dailyHours(r)])), data.leave), [data, week]);
  const slots = board ?? derived;
  const projectIds = new Set(Object.values(slots).flatMap(row => Object.values(row).flatMap(d => [d.am, d.pm, ...d.overload].filter((s): s is DerivedSlot => !!s).map(s => s.projectId))));
  const projectColour = (id: string) => ({ "--week-project-color": projects.get(id)?.color || "var(--chart-2)" }) as CSSProperties;
  function booking(slot: DerivedSlot | null) {
    if (!slot) return <span className="text-muted-foreground/40">—</span>;
    return <div className={cn("week-booking flex min-h-11 min-w-0 items-center gap-1.5 px-2 py-1.5 text-sm", colour === "full" && "week-booking-full")} style={projectColour(slot.projectId)}>
      <span className="min-w-0 flex-1 break-words">{projects.get(slot.projectId)?.name}</span>
      {slot.isSiteVisit && <MapPin className="h-3.5 w-3.5 shrink-0" aria-label={t("weekPlan.siteVisit")} />}
      {!slot.stageId && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label={t("weekPlan.noStage")} />}
      {slot.inferred && <span title={t("weekPlan.inferredHint")} className="text-sm text-muted-foreground">~</span>}
    </div>;
  }
  return <section className="min-w-0" aria-label={t("weekPlan.title")}>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <ToggleGroup type="single" value={view} onValueChange={v => v && setView(v)} className="justify-start rounded-md border border-border p-1" aria-label={t("weekPlan.view")}>
        <ToggleGroupItem value="person" className="gap-2 text-xs"><Users className="h-4 w-4" />{t("common:byPerson")}</ToggleGroupItem>
        <ToggleGroupItem value="project" className="gap-2 text-xs"><Briefcase className="h-4 w-4" />{t("common:byProject")}</ToggleGroupItem>
      </ToggleGroup>
      <ToggleGroup type="single" value={colour} onValueChange={v => v && setColour(v)} className="justify-start rounded-md border border-border p-1" aria-label={t("weekPlan.colourStyle")}>
        <ToggleGroupItem value="stripe" className="gap-2 text-xs"><PanelLeft className="h-3.5 w-3.5" />{t("weekPlan.colourStripe")}</ToggleGroupItem>
        <ToggleGroupItem value="full" className="gap-2 text-xs"><Square className="h-3.5 w-3.5" />{t("weekPlan.colourFull")}</ToggleGroupItem>
      </ToggleGroup>
    </div>
    <div className="max-w-full overflow-x-auto border-y border-border" data-testid="week-board-scroll">
      <table className="w-full min-w-[950px] table-fixed border-collapse text-sm">
        <colgroup><col className="w-56" /><col className="w-8" />{days.map(d => <col key={d} />)}</colgroup>
        <thead><tr className="border-b border-border bg-muted/40 text-muted-foreground">
          <th className="sticky left-0 z-10 bg-background px-4 py-4 text-left font-medium" colSpan={2}>{view === "person" ? t("glossary:hr.employee") : t("glossary:entity.project")}</th>
          {days.map((day, i) => <th key={day} className="px-2 py-4 text-left font-medium"><span>{t(`common:weekdays.short.${i + 1}`)}</span><span className="ml-2 font-mono text-xs opacity-70">{format(parseISO(day), "dd")}</span></th>)}
        </tr></thead>
        <tbody>
          {view === "person" ? data.resources.map(r => {
            const row = slots[r.id];
            if (!row) return null;
            const counts = resourceSlotCounts(row);
            const own = !!data.my_collaborator_id && r.collaborator_id === data.my_collaborator_id;
            return ["am", "pm"].map((part, index) => <tr key={`${r.id}-${part}`} className={cn(index === 1 && "border-b border-border", own && "bg-accent/50")} data-own-row={own || undefined}>
              {index === 0 && <th rowSpan={2} className={cn("sticky left-0 z-10 border-r border-border bg-background px-4 py-4 text-left align-middle font-normal", own && "bg-accent")}>
                <div className="flex items-start gap-2"><span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", own ? "bg-primary" : "bg-muted-foreground/40")} /><div className="min-w-0"><p className="break-words font-medium">{r.name}</p><p className="mt-1 font-mono text-[11px] text-muted-foreground">{t("weekPlan.slotCount", { booked: counts.booked, available: counts.available, free: counts.free })}</p>{editing && <Button variant="ghost" size="sm" className="mt-1 h-7 px-0 text-xs" onClick={() => editing.wholeWeek(r.id)}>{t("weekPlan.wholeWeek")}</Button>}</div></div>
              </th>}
              <th className="px-1 text-center text-[10px] font-medium text-muted-foreground" title={t(`common:${part === "am" ? "morning" : "afternoon"}`)}>{t(`common:${part === "am" ? "morningShort" : "afternoonShort"}`)}</th>
              {days.map(day => {
                const cell = row[day]; const slot = part === "am" ? cell.am : cell.pm;
                return <td key={day} className="h-14 px-1 py-1 align-middle">
                  {cell.leave ? <div data-testid={`leave-${r.id}-${day}-${part}`} className="flex min-h-11 items-center rounded-sm border border-dashed border-border bg-ts-nonworking px-2 text-xs text-muted-foreground" title={cell.leave.name ?? undefined}>{t(`glossary:hr.${cell.leave.kind === "holiday" ? "holiday" : "leave"}`)}</div> : <div className="relative min-h-11">{editing ? <Button variant="ghost" className="h-auto min-h-11 w-full touch-none select-none justify-start whitespace-normal rounded-sm p-0 text-left font-normal focus-visible:ring-2" data-slot={`${r.id}/${day}/${part}`} aria-label={`${r.name} · ${day} · ${t(`common:${part === "am" ? "morning" : "afternoon"}`)}`} onPointerDown={e => { if(e.button!==0) return; e.preventDefault(); editing.start(); editing.paint(r.id,day,part as DayPart); }} onPointerEnter={() => { if(editing.isDown()) editing.paint(r.id,day,part as DayPart); }} onClick={e => { if(e.detail===0) { editing.start(); editing.paint(r.id,day,part as DayPart); editing.finish(); } }}>{booking(slot)}{editing.changed.has(`${r.id}/${day}/${part}`) && <span className="absolute right-1 bottom-1 h-1.5 w-1.5 rounded-full bg-primary" aria-label={t("weekPlan.changed")} />}</Button> : booking(slot)}
                    {part === "am" && cell.overload.length > 0 && <Popover><PopoverTrigger asChild><Button variant="ghost" size="icon" className="absolute -right-1 -top-1 h-6 w-6 text-destructive" aria-label={t("weekPlan.overload")} title={cell.overload.map(s => projects.get(s.projectId)?.name).join(", ")}><AlertTriangle className="h-3.5 w-3.5" /></Button></PopoverTrigger><PopoverContent><p className="mb-2 text-sm font-medium text-destructive">{t("weekPlan.overload")}</p>{cell.overload.map(s => <p key={s.allocationId} className="text-sm">{projects.get(s.projectId)?.name}</p>)}</PopoverContent></Popover>}
                    {part === "pm" && cell.otherHours > 0 && <span className="block px-2 text-[10px] text-muted-foreground">{t("weekPlan.otherHours", { hours:cell.otherHours })}</span>}
                  </div>}
                </td>;
              })}
            </tr>);
          }) : data.projects.filter(p => projectIds.has(p.id)).map(p => {
            let total = 0;
            const bookings = days.map(day => data.resources.flatMap(r => {
              const cell = slots[r.id]?.[day]; if (!cell) return [];
              const am = cell.am?.projectId === p.id; const pm = cell.pm?.projectId === p.id;
              total += Number(am) + Number(pm);
              const overflow = cell.overload.some(s => s.projectId === p.id);
              if (!am && !pm && !overflow) return [];
              return [{ id:r.id, name:r.name, am, pm, overflow, site:(am && cell.am?.isSiteVisit) || (pm && cell.pm?.isSiteVisit) }];
            }));
            return <tr key={p.id} className="border-b border-border">
              <th colSpan={2} className="sticky left-0 z-10 border-r border-border bg-background px-4 py-4 text-left font-normal"><div className="week-booking px-2 py-1" style={projectColour(p.id)}><p className="break-words font-medium">{p.name}</p><p className="mt-1 text-xs text-muted-foreground">{t("weekPlan.halfDays", { count:total })}</p></div></th>
              {bookings.map((people, i) => <td key={days[i]} className="px-3 py-3 align-top">{people.map(person => <p key={person.id} className="mb-1 flex items-center gap-1 text-xs"><span className="break-words">{person.name}{person.am !== person.pm ? ` · ${t(`common:${person.am ? "morningShort" : "afternoonShort"}`)}` : ""}</span>{person.site && <MapPin className="h-3 w-3 shrink-0" />}{person.overflow && <AlertTriangle className="h-3 w-3 shrink-0 text-destructive" aria-label={t("weekPlan.overload")} />}</p>)}</td>)}
            </tr>;
          })}
        </tbody>
      </table>
      {view === "project" && !projectIds.size && <p className="py-12 text-center text-sm text-muted-foreground">{t("weekPlan.emptyBookings")}</p>}
      {!data.resources.length && <p className="py-12 text-center text-sm text-muted-foreground">{t("weekPlan.emptyPeople")}</p>}
    </div>
  </section>;
}