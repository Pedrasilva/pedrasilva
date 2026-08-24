/**
 * Captures WHY an opportunity was lost.
 *
 * Moving a deal to the "Lost" stage always goes through this dialog so the
 * firm builds a queryable dataset of lost work (reason category + notes),
 * instead of a stage change with no explanation.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { LOST_REASON_CODES, type LostReasonCode } from "@/lib/crm/types";

export type MarkLostPayload = {
  lost_reason_code: LostReasonCode;
  lost_reason_notes: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCode?: LostReasonCode | null;
  initialNotes?: string | null;
  saving?: boolean;
  onConfirm: (payload: MarkLostPayload) => void;
};

export function MarkLostDialog({
  open, onOpenChange, initialCode, initialNotes, saving, onConfirm,
}: Props) {
  const { t } = useTranslation("crm");
  const [code, setCode] = useState<LostReasonCode | "">("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setCode(initialCode ?? "");
    setNotes(initialNotes ?? "");
  }, [open, initialCode, initialNotes]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("opportunities.lost.title")}</DialogTitle>
          <DialogDescription>{t("opportunities.lost.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">
              {t("opportunities.lost.reasonLabel")}
            </Label>
            <Select value={code} onValueChange={(v) => setCode(v as LostReasonCode)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder={t("opportunities.lost.reasonPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {LOST_REASON_CODES.map((c) => (
                  <SelectItem key={c} value={c}>{t(`opportunities.lost.reason.${c}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">
              {t("opportunities.lost.notesLabel")}
            </Label>
            <Textarea
              className="mt-1"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("opportunities.lost.notesPlaceholder")}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!code || saving}
            onClick={() =>
              code && onConfirm({
                lost_reason_code: code,
                lost_reason_notes: notes.trim() ? notes.trim() : null,
              })
            }
          >
            {t("opportunities.lost.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
