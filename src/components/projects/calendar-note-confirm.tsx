import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type CalendarConfirmItem = { id: string; hours: number; suggested: string };

/**
 * Confirm step before a calendar event becomes a timesheet activity. The
 * description is prefilled with "10:00–11:00 · <title>" and saved only as the
 * person leaves it (they can shorten or clear it).
 */
export function CalendarNoteConfirm({
  open,
  label,
  items,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  label: string;
  items: CalendarConfirmItem[];
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (notes: Record<string, string>) => void;
}) {
  const { t } = useTranslation("projects");
  const [notes, setNotes] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) setNotes(Object.fromEntries(items.map((i) => [i.id, i.suggested])));
  }, [open, items]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("tsCalendar.confirmTitle")}</DialogTitle>
          <DialogDescription>{label}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {items.map((i) => (
            <div key={i.id} className="space-y-1">
              <div className="text-xs text-muted-foreground">{t("tsCalendar.confirmHours", { hours: i.hours.toFixed(2).replace(/\.?0+$/, "") })}</div>
              <Input
                value={notes[i.id] ?? ""}
                onChange={(e) => setNotes((n) => ({ ...n, [i.id]: e.target.value }))}
                aria-label={t("tsCalendar.confirmDescription")}
                placeholder={t("tsCalendar.confirmDescription")}
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">{t("tsCalendar.confirmHint")}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>{t("tsCalendar.confirmCancel")}</Button>
          <Button onClick={() => onConfirm(notes)} disabled={busy}>{t("tsCalendar.confirmSave")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
