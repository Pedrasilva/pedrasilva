import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAssignAsset } from "@/lib/inventory/use-inventory";
import { useCollaboratorsList } from "@/lib/hr/use-collaborators";
import { CUSTODY_MODES, type CustodyMode, type InventoryAsset } from "@/lib/inventory/types";

/**
 * Custody change. Writing an assignment row is the only way custody changes —
 * the database trigger closes the previous assignment, logs the event and
 * mirrors the current custody onto the asset.
 */
export function AssignAssetDialog({
  asset,
  open,
  onOpenChange,
}: {
  asset: InventoryAsset;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useTranslation(["inventory", "common"]);
  const { data: collaborators = [] } = useCollaboratorsList({ status: "active" });
  const assign = useAssignAsset();
  const [mode, setMode] = useState<CustodyMode>("person");
  const [collaboratorId, setCollaboratorId] = useState("");
  const [location, setLocation] = useState("");
  const [assignedOn, setAssignedOn] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setMode(asset.custody_mode);
    setCollaboratorId(asset.assigned_collaborator_id ?? "");
    setLocation(asset.location ?? "");
    setAssignedOn(new Date().toISOString().slice(0, 10));
    setNotes("");
  }, [open, asset]);

  const submit = async () => {
    try {
      await assign.mutateAsync({
        asset_id: asset.id,
        custody_mode: mode,
        collaborator_id: mode === "person" ? collaboratorId || null : null,
        location: mode === "person" ? null : location.trim() || null,
        assigned_on: assignedOn,
        notes: notes.trim() || null,
      });
      toast.success(t("inventory:assign.done"));
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("inventory:assign.title")} · {asset.asset_code}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>{t("inventory:asset.custodyMode")}</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as CustodyMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CUSTODY_MODES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {t(`inventory:custody.${m}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {mode === "person" ? (
            <div>
              <Label>{t("inventory:asset.assignedTo")}</Label>
              <Select value={collaboratorId} onValueChange={setCollaboratorId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {collaborators.map((c) => (
                    <SelectItem key={c.id as string} value={c.id as string}>
                      {(c as { nome: string }).nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div>
              <Label>{t("inventory:asset.location")}</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
          )}

          <div>
            <Label>{t("inventory:assign.assignedOn")}</Label>
            <Input
              type="date"
              value={assignedOn}
              onChange={(e) => setAssignedOn(e.target.value)}
            />
          </div>

          <div>
            <Label>{t("inventory:asset.notes")}</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common:cancel")}
          </Button>
          <Button
            onClick={submit}
            disabled={assign.isPending || (mode === "person" && !collaboratorId)}
          >
            {t("inventory:assign.assign")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
