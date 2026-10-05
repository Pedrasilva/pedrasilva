import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { addDays, format, startOfWeek } from "date-fns";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDateLocale } from "@/i18n/use-date-locale";
import { cn } from "@/lib/utils";
import { formatHM, parseHM } from "@/lib/projects/time-format";
import { useNonWorkingDays, nonWorkingLine } from "@/lib/projects/use-non-working-days";
import type { EntryType, TimesheetEntry } from "@/lib/projects/use-timesheet";

type Activity = Pick<TimesheetEntry, "id" | "hours" | "notes" | "billable" | "source" | "approval_status" | "non_working_day_reason" | "calendar_event_ids">;

const sourceKind = (a: Activity): "calendar" | "assistant" | "typed" =>
  a.source === "calendar" || (a.calendar_event_ids?.length ?? 0) > 0 ? "calendar" : a.source === "assistant" ? "assistant" : "typed";

/**
 * One timesheet cell (person + day + row). Holds several activities
 * (pm_time_entries), each with its own hours and note. An empty cell edits
 * straight into its first activity; a filled cell opens the activity list.
 * On phones the editor is a bottom sheet.
 */
export function HourCell({
  date,
  title,
  subtitle,
  entryType,
  activities,
  suggested,
  disabled,
  readOnly,
  singleActivity,
  onCommit,
}: {
  date: Date;
  title: string;
  subtitle: string;
  entryType: EntryType;
  activities: Activity[];
  suggested: number;
  disabled: boolean;
  readOnly?: boolean;
  /** Non-working rows allow one entry per day (database rule). */
  singleActivity?: boolean;
  /** hours = 0 deletes the activity; id = null creates a new one. */
  onCommit: (hours: number, notes: string | null, billable: boolean, id: string | null) => void;
}) {
  const { t } = useTranslation("projects");
  const locale = useDateLocale();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const value = activities.reduce((a, x) => a + x.hours, 0);
  const count = activities.length;
  const first = activities[0];
  const billable = activities.every((a) => a.billable);
  const hasNotes = activities.some((a) => a.notes);

  const isoDay = format(date, "yyyy-MM-dd");
  const wkStart = format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const wkEnd = format(addDays(startOfWeek(date, { weekStartsOn: 1 }), 6), "yyyy-MM-dd");
  const nwdMap = useNonWorkingDays(wkStart, wkEnd).data;
  const nwdInfo = entryType !== "non_working" ? nwdMap?.get(isoDay) ?? null : null;

  const display = formatHM(value);
  const placeholder = suggested ? formatHM(suggested) : "–";
  const cellCls =
    value > 0
      ? entryType === "project"
        ? billable
          ? "border-border bg-background text-foreground hover:border-ring"
          : "border-dashed border-border bg-muted/40 text-muted-foreground hover:border-ring"
        : entryType === "internal"
          ? "border-border bg-muted/50 text-foreground hover:border-ring"
          : "border-border bg-accent/40 text-foreground hover:border-ring"
      : "border-transparent text-muted-foreground hover:border-border hover:bg-background";

  const trigger = (
    <button
      type="button"
      disabled={disabled}
      onClick={isMobile ? () => setOpen(true) : undefined}
      title={count === 1 && first?.notes ? first.notes : undefined}
      className={`relative flex h-9 w-20 flex-col items-center justify-center rounded border text-center font-mono text-sm leading-none transition ${cellCls}`}
    >
      <span>{display || <span className={suggested ? "text-muted-foreground/60" : "text-muted-foreground/40"}>{placeholder}</span>}</span>
      {count > 1 && <span className="mt-0.5 font-sans text-[9px] text-muted-foreground">{t("tsActivities.count", { count })}</span>}
      {hasNotes && value > 0 && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" />}
      {nwdInfo && value > 0 && (
        <span aria-label={t(`nonWorkingDay.badge.${nwdInfo.reason}`)} className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full bg-warning" />
      )}
    </button>
  );

  const body = (
    <CellBody
      key={open ? "open" : "closed"}
      date={date}
      title={title}
      subtitle={subtitle}
      entryType={entryType}
      activities={activities}
      placeholder={placeholder}
      readOnly={readOnly}
      singleActivity={singleActivity}
      nwdNote={nwdInfo ? (
        <div className="mt-2 rounded border border-warning/40 bg-warning/10 px-2 py-1.5 text-[11px]">
          <span className="mr-1 font-medium text-warning">{t(`nonWorkingDay.badge.${nwdInfo.reason}`)}</span>
          {nonWorkingLine(t, isoDay, nwdInfo, locale)}
        </div>
      ) : null}
      onCommit={onCommit}
      onClose={() => setOpen(false)}
    />
  );

  if (isMobile)
    return (
      <>
        {trigger}
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent className="max-h-[85vh]">
            <DrawerTitle className="sr-only">{title}</DrawerTitle>
            <div className="overflow-y-auto pb-4">{body}</div>
          </DrawerContent>
        </Drawer>
      </>
    );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="center" className="w-[22rem] p-0">
        {body}
      </PopoverContent>
    </Popover>
  );
}

function CellBody({
  date,
  title,
  subtitle,
  entryType,
  activities,
  placeholder,
  readOnly,
  singleActivity,
  nwdNote,
  onCommit,
  onClose,
}: {
  date: Date;
  title: string;
  subtitle: string;
  entryType: EntryType;
  activities: Activity[];
  placeholder: string;
  readOnly?: boolean;
  singleActivity?: boolean;
  nwdNote: React.ReactNode;
  onCommit: (hours: number, notes: string | null, billable: boolean, id: string | null) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("projects");
  const locale = useDateLocale();
  // Empty cell → edit the first activity straight away (note optional, as before).
  const [editing, setEditing] = useState<{ id: string | null } | null>(activities.length === 0 && !readOnly ? { id: null } : null);
  const isFirst = activities.length === 0;

  return (
    <div>
      <div className="border-b border-border px-4 py-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{format(date, "EEEE, d MMM", { locale })}</div>
        <div className="mt-0.5 truncate text-sm font-medium">{title}</div>
        <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
        {nwdNote}
      </div>
      {editing ? (
        <ActivityForm
          entryType={entryType}
          initial={editing.id ? activities.find((a) => a.id === editing.id) ?? null : null}
          placeholder={placeholder}
          noteRequired={!isFirst && !editing.id}
          onCancel={() => (isFirst ? onClose() : setEditing(null))}
          onSave={(h, n, b) => {
            onCommit(h, n, b, editing.id);
            if (isFirst) onClose();
            else setEditing(null);
          }}
          onDelete={editing.id ? () => { onCommit(0, null, true, editing.id); setEditing(null); if (activities.length <= 1) onClose(); } : undefined}
        />
      ) : (
        <div className="space-y-2 px-4 py-3">
          {activities.length === 0 && <p className="text-sm text-muted-foreground">{t("tsActivities.empty")}</p>}
          {activities.map((a) => {
            const src = sourceKind(a);
            return (
              <div key={a.id} className="rounded border border-border p-2">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="font-mono text-sm font-medium">{formatHM(a.hours)}</span>
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{t(`tsActivities.source.${src}`)}</Badge>
                      {a.approval_status && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "h-5 px-1.5 text-[10px]",
                            a.approval_status === "pending" && "border-warning/50 text-warning",
                            a.approval_status === "rejected" && "border-destructive/50 text-destructive",
                          )}
                        >
                          {t(`tsActivities.status.${a.approval_status}`, { defaultValue: a.approval_status })}
                        </Badge>
                      )}
                      {a.non_working_day_reason && (
                        <Badge variant="outline" className="h-5 border-warning/50 px-1.5 text-[10px] text-warning">
                          {t(`nonWorkingDay.badge.${a.non_working_day_reason}`)}
                        </Badge>
                      )}
                      {entryType === "project" && !a.billable && (
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{t("tsActivities.nonBillable")}</Badge>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                      {a.notes || t("tsActivities.noNote")}
                    </p>
                  </div>
                  {!readOnly && (
                    <div className="flex shrink-0 gap-0.5">
                      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={t("tsActivities.edit")} onClick={() => setEditing({ id: a.id })}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        aria-label={t("tsActivities.delete")}
                        onClick={() => {
                          onCommit(0, null, true, a.id);
                          if (activities.length <= 1) onClose();
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {readOnly ? (
            <p className="text-[11px] text-muted-foreground">{t("tsActivities.readOnly")}</p>
          ) : (
            !(singleActivity && activities.length >= 1) && (
              <Button variant="outline" size="sm" className="w-full" onClick={() => setEditing({ id: null })}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                {t("tsActivities.add")}
              </Button>
            )
          )}
        </div>
      )}
    </div>
  );
}

function ActivityForm({
  entryType,
  initial,
  placeholder,
  noteRequired,
  onSave,
  onCancel,
  onDelete,
}: {
  entryType: EntryType;
  initial: Activity | null;
  placeholder: string;
  noteRequired: boolean;
  onSave: (hours: number, notes: string | null, billable: boolean) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation("projects");
  const [hours, setHours] = useState(initial ? formatHM(initial.hours) : "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [billable, setBillable] = useState(initial?.billable ?? true);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const id = setTimeout(() => ref.current?.select(), 50);
    return () => clearTimeout(id);
  }, []);

  const save = () => {
    const parsed = parseHM(hours);
    if (parsed === null || parsed <= 0 || parsed > 24) return setError(t("tsActivities.hoursError"));
    const n = notes.trim();
    if (noteRequired && !n) return setError(t("tsActivities.noteRequired"));
    setError(null);
    onSave(parsed, n || null, entryType === "project" ? billable : false);
  };

  return (
    <>
      <div className="space-y-3 px-4 py-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("tsActivities.hours")}</label>
          <Input
            ref={ref}
            inputMode="decimal"
            value={hours}
            onChange={(e) => {
              setHours(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                save();
              }
            }}
            placeholder={placeholder}
            className="font-mono"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            {t("tsActivities.note")}
            {noteRequired ? " *" : ""}
          </label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("tsActivities.notePlaceholder")} rows={3} className="resize-none text-sm" />
        </div>
        {entryType === "project" ? (
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded border border-border bg-muted/30 px-3 py-2">
            <div className="min-w-0">
              <div className="text-sm font-medium">{t("tsActivities.billable")}</div>
              <div className="text-[11px] text-muted-foreground">{t("tsActivities.billableHint")}</div>
            </div>
            <input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} className="h-4 w-4 shrink-0 cursor-pointer accent-primary" />
          </label>
        ) : (
          <div className="rounded border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
            {entryType === "internal" ? t("tsActivities.internalHint") : t("tsActivities.nonWorkingHint")}
          </div>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2">
        {onDelete ? (
          <Button type="button" variant="ghost" size="sm" onClick={onDelete} className="text-muted-foreground hover:text-destructive">
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            {t("tsActivities.delete")}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            {t("tsActivities.cancel")}
          </Button>
          <Button type="button" size="sm" onClick={save}>
            {t("tsActivities.save")}
          </Button>
        </div>
      </div>
    </>
  );
}
