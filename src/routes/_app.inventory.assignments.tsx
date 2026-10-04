import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useInventoryAssets,
  useOpenAssignments,
  useReturnAsset,
} from "@/lib/inventory/use-inventory";
import { useCollaboratorsList } from "@/lib/hr/use-collaborators";

export const Route = createFileRoute("/_app/inventory/assignments")({
  component: AssignmentsPage,
});

function AssignmentsPage() {
  const { t } = useTranslation(["inventory", "common"]);
  const { data: assignments = [] } = useOpenAssignments();
  const { data: assets = [] } = useInventoryAssets();
  const { data: collaborators = [] } = useCollaboratorsList({ status: "all" });
  const returnAsset = useReturnAsset();

  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const nameById = useMemo(
    () => new Map(collaborators.map((c) => [c.id as string, (c as { nome: string }).nome])),
    [collaborators],
  );

  const doReturn = async (id: string) => {
    try {
      await returnAsset.mutateAsync({ assignmentId: id });
      toast.success(t("inventory:assign.returned"));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("inventory:asset.code")}</TableHead>
            <TableHead>{t("inventory:asset.name")}</TableHead>
            <TableHead>{t("inventory:asset.custodyMode")}</TableHead>
            <TableHead>{t("inventory:asset.assignedTo")}</TableHead>
            <TableHead>{t("inventory:assign.assignedOn")}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {assignments.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                {t("inventory:assign.none")}
              </TableCell>
            </TableRow>
          )}
          {assignments.map((a) => {
            const asset = assetById.get(a.asset_id);
            return (
              <TableRow key={a.id}>
                <TableCell className="font-mono text-xs">
                  <Link to="/inventory/assets/$assetId" params={{ assetId: a.asset_id }}>
                    {asset?.asset_code ?? "—"}
                  </Link>
                </TableCell>
                <TableCell>{asset?.name ?? "—"}</TableCell>
                <TableCell className="text-sm">{t(`inventory:custody.${a.custody_mode}`)}</TableCell>
                <TableCell className="text-sm">
                  {a.collaborator_id ? (nameById.get(a.collaborator_id) ?? "—") : (a.location ?? "—")}
                </TableCell>
                <TableCell className="text-sm">{a.assigned_on?.slice(0, 10)}</TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => doReturn(a.id)}
                    disabled={returnAsset.isPending}
                  >
                    {t("inventory:assign.return")}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
