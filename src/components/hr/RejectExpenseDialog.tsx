import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function RejectExpenseDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Should throw on failure so the dialog keeps open. */
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setReason("");
      setLoading(false);
    }
  }, [open]);

  const trimmed = reason.trim();
  const valid = trimmed.length >= 3;

  async function confirm() {
    if (!valid || loading) return;
    setLoading(true);
    try {
      await onConfirm(trimmed);
      onOpenChange(false);
    } catch {
      // caller already toasted
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (!loading ? onOpenChange(v) : null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rejeitar despesa</DialogTitle>
          <DialogDescription>
            Indique o motivo da rejeição. O colaborador será notificado e o saldo é devolvido.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>Motivo *</Label>
          <Textarea
            rows={4}
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex: Factura não corresponde ao colaborador / fora do âmbito da categoria…"
          />
          {!valid && reason.length > 0 && (
            <p className="text-[11px] text-rose-600">Mínimo 3 caracteres.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={!valid || loading}>
            {loading ? "A rejeitar…" : "Rejeitar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
