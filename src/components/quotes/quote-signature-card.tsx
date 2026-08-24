/**
 * Signature checkpoint card — step 3 of the quote workspace.
 *
 * Shows whether the approved quote has been signed (DocuSign or manually) and
 * offers the one action that moves it forward. Conversion to a project is
 * gated on this card being green.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CheckCircle2, FileSignature, PenLine } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useClearQuoteSignature,
  useMarkQuoteSigned,
  useQuoteSignature,
} from "@/lib/quotes/use-quote-signature";
import type { QuoteStatus } from "@/lib/crm/types";

export function QuoteSignatureCard({
  quoteId,
  quoteStatus,
  onEditContent,
}: {
  quoteId: string;
  quoteStatus: QuoteStatus;
  onEditContent?: () => void;
}) {
  const { t } = useTranslation("crm");
  const sig = useQuoteSignature(quoteId);
  const mark = useMarkQuoteSigned(quoteId);
  const clear = useClearQuoteSignature(quoteId);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  const isApproved = quoteStatus === "approved";
  const signed = sig.data?.isSigned ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSignature className="h-4 w-4 text-primary" />
          {t("workspace.signature.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {signed ? (
          <>
            <p className="flex items-center gap-2 font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              {t("workspace.signature.signedOn", {
                date: sig.data?.signedAt ? new Date(sig.data.signedAt).toLocaleDateString() : "—",
                method: t(`workspace.signature.method.${sig.data?.signedMethod ?? "manual"}`),
              })}
            </p>
            {sig.data?.signedNotes && (
              <p className="text-xs text-muted-foreground">{sig.data.signedNotes}</p>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={clear.isPending}
              onClick={() =>
                clear.mutate(undefined, {
                  onSuccess: () => toast.success(t("workspace.signature.clearedToast")),
                  onError: (e: Error) => toast.error(e.message),
                })
              }
            >
              {t("workspace.signature.clear")}
            </Button>
          </>
        ) : (
          <>
            <p className="text-muted-foreground">
              {isApproved
                ? t("workspace.signature.awaitingHint")
                : t("workspace.signature.onlyApproved")}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={!isApproved} onClick={() => setOpen(true)}>
                <PenLine className="mr-1 h-4 w-4" />
                {t("workspace.signature.markSigned")}
              </Button>
              <Button size="sm" variant="outline" onClick={onEditContent}>
                <FileSignature className="mr-1 h-4 w-4" />
                {t("workspace.signature.sendForSignature")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("workspace.signature.docusignHint")}</p>
          </>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("workspace.signature.dialog.title")}</DialogTitle>
            <DialogDescription>{t("workspace.signature.dialog.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t("workspace.signature.dialog.dateLabel")}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t("workspace.signature.dialog.notesLabel")}</Label>
              <Textarea
                rows={3}
                value={notes}
                placeholder={t("workspace.signature.dialog.notesPlaceholder")}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!date || mark.isPending}
              onClick={() =>
                mark.mutate(
                  { signedAt: date, notes },
                  {
                    onSuccess: () => {
                      setOpen(false);
                      setNotes("");
                      toast.success(t("workspace.signature.markedToast"));
                    },
                    onError: (e: Error) => toast.error(e.message),
                  },
                )
              }
            >
              {t("workspace.signature.dialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
