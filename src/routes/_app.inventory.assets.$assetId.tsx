import { Link, createFileRoute, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AssetFormDialog } from "@/components/inventory/asset-form-dialog";
import { AssignAssetDialog } from "@/components/inventory/assign-asset-dialog";
import {
  useAssetAssignments,
  useAssetEvents,
  useInventoryAsset,
  useInventoryCategories,
  useReturnAsset,
} from "@/lib/inventory/use-inventory";
import { useCollaboratorsList } from "@/lib/hr/use-collaborators";
import {
  annualDepreciation,
  indicativeDepreciatedValue,
  plannedReplacementDate,
} from "@/lib/inventory/types";

export const Route = createFileRoute("/_app/inventory/assets/$assetId")({
  component: AssetDetail,
});

const eur = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
const day = (v: string | null | undefined) => (v ? v.slice(0, 10) : "—");

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function AssetDetail() {
  const { assetId } = useParams({ from: "/_app/inventory/assets/$assetId" });
  const { t } = useTranslation(["inventory", "common"]);
  const { data: asset, isLoading } = useInventoryAsset(assetId);
  const { data: categories = [] } = useInventoryCategories();
  const { data: assignments = [] } = useAssetAssignments(assetId);
  const { data: events = [] } = useAssetEvents(assetId);
  const { data: collaborators = [] } = useCollaboratorsList({ status: "all" });
  const returnAsset = useReturnAsset();
  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  const nameById = useMemo(
    () => new Map(collaborators.map((c) => [c.id as string, (c as { nome: string }).nome])),
    [collaborators],
  );
  const category = categories.find((c) => c.id === asset?.category_id);
  const openAssignment = assignments.find((a) => !a.returned_on);

  if (isLoading || !asset) {
    return <p className="text-sm text-muted-foreground">{t("common:loading")}</p>;
  }

  const doReturn = async () => {
    if (!openAssignment) return;
    try {
      await returnAsset.mutateAsync({ assignmentId: openAssignment.id });
      toast.success(t("inventory:assign.returned"));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted-foreground">{asset.asset_code}</p>
          <h2 className="truncate text-lg font-semibold">{asset.name}</h2>
        </div>
        <Badge variant="secondary">{t(`inventory:status.${asset.status}`)}</Badge>
        <Badge variant="outline">{t(`inventory:tracking.${asset.tracking_level}`)}</Badge>
        <div className="ml-auto flex gap-2">
          {openAssignment && (
            <Button size="sm" variant="outline" onClick={doReturn} disabled={returnAsset.isPending}>
              {t("inventory:assign.return")}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}>
            {openAssignment ? t("inventory:assign.reassign") : t("inventory:assign.assign")}
          </Button>
          <Button size="sm" onClick={() => setEditOpen(true)}>
            {t("common:edit")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("inventory:asset.name")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Row label={t("inventory:asset.category")} value={category?.name ?? "—"} />
            <Row label={t("inventory:asset.brand")} value={asset.brand ?? "—"} />
            <Row label={t("inventory:asset.model")} value={asset.model ?? "—"} />
            <Row label={t("inventory:asset.serialNumber")} value={asset.serial_number ?? "—"} />
            <Row
              label={t("inventory:asset.custodyMode")}
              value={t(`inventory:custody.${asset.custody_mode}`)}
            />
            <Row
              label={t("inventory:asset.assignedTo")}
              value={
                asset.assigned_collaborator_id
                  ? (nameById.get(asset.assigned_collaborator_id) ?? "—")
                  : (asset.location ?? "—")
              }
            />
            <Row label={t("inventory:asset.department")} value={asset.department ?? "—"} />
            <Row label={t("inventory:asset.notes")} value={asset.notes ?? "—"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("inventory:asset.purchaseDate")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-xs text-muted-foreground">
              {t("inventory:asset.financeNote")}
            </p>
            <Row label={t("inventory:asset.purchaseDate")} value={day(asset.purchase_date)} />
            <Row
              label={t("inventory:asset.purchasePriceEx")}
              value={eur(asset.purchase_price_ex_vat)}
            />
            <Row label={t("inventory:asset.vat")} value={eur(asset.vat_amount)} />
            <Row
              label={t("inventory:asset.purchasePriceInc")}
              value={eur(asset.purchase_price_inc_vat)}
            />
            <Row
              label={t("inventory:asset.invoiceNumber")}
              value={
                asset.source_document_id ? (
                  <Link
                    to="/finance/documents/$documentId"
                    params={{ documentId: asset.source_document_id }}
                    className="underline"
                  >
                    {asset.invoice_number_snapshot ?? t("inventory:asset.viewInvoice")}
                  </Link>
                ) : (
                  (asset.invoice_number_snapshot ?? "—")
                )
              }
            />
            <Row
              label={t("inventory:asset.sourceLine")}
              value={
                asset.source_document_line_id
                  ? `#${asset.source_unit_index ?? 1}`
                  : "—"
              }
            />
            <Separator className="my-2" />
            <Row label={t("inventory:asset.warrantyExpiry")} value={day(asset.warranty_expiry)} />
            <Row
              label={t("inventory:asset.depreciationYears")}
              value={asset.depreciation_years}
            />
            <Row
              label={t("inventory:asset.annualDepreciation")}
              value={eur(annualDepreciation(asset))}
            />
            <Row
              label={t("inventory:asset.depreciatedValue")}
              value={eur(indicativeDepreciatedValue(asset))}
            />
            <Row
              label={t("inventory:asset.replacementYears")}
              value={`${asset.replacement_years} · ${day(
                plannedReplacementDate(asset)?.toISOString() ?? null,
              )}`}
            />
            <Row label={t("inventory:asset.insuranceValue")} value={eur(asset.insurance_value)} />
            <Row
              label={t("inventory:asset.includeInsurance")}
              value={asset.include_in_insurance_register ? "✓" : "—"}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("inventory:asset.assignments")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {assignments.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("inventory:assign.none")}</p>
            )}
            {assignments.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-sm">
                <span>
                  {a.collaborator_id
                    ? (nameById.get(a.collaborator_id) ?? "—")
                    : (a.location ?? t(`inventory:custody.${a.custody_mode}`))}
                </span>
                <span className="text-xs text-muted-foreground">
                  {day(a.assigned_on)} → {a.returned_on ? day(a.returned_on) : t("inventory:asset.openAssignment")}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("inventory:asset.history")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {events.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("inventory:asset.noHistory")}</p>
            )}
            {events.map((e) => (
              <div key={e.id} className="flex items-start justify-between gap-3 text-sm">
                <span className="text-xs text-muted-foreground">{day(e.event_date)}</span>
                <span className="flex-1 text-right">
                  {e.event_type}
                  {e.previous_value || e.new_value ? (
                    <span className="text-muted-foreground">
                      {" "}
                      {e.previous_value ?? "—"} → {e.new_value ?? "—"}
                    </span>
                  ) : null}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <AssetFormDialog open={editOpen} onOpenChange={setEditOpen} asset={asset} />
      <AssignAssetDialog asset={asset} open={assignOpen} onOpenChange={setAssignOpen} />
    </div>
  );
}
