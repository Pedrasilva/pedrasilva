/**
 * Stage 6A — Project Bootstrap card.
 * Renders ONLY for signed contracts. Shows a deterministic preview of the
 * project shell + stages, then either:
 *  - links to the already-bootstrapped project, or
 *  - lets the user apply the bootstrap (idempotent: one applied run / contract).
 */
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Rocket, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  usePreviewProjectBootstrap,
  useApplyProjectBootstrap,
  useProjectBootstrapRunForContract,
} from "@/lib/project-bootstrap";

export function ContractBootstrapCard({ contractId }: { contractId: string }) {
  const { t } = useTranslation("crm");
  const navigate = useNavigate();
  const runQ = useProjectBootstrapRunForContract(contractId);
  const previewQ = usePreviewProjectBootstrap(contractId);
  const applyMut = useApplyProjectBootstrap();

  const applied = runQ.data?.applied ?? null;

  if (applied?.target_project_id) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Rocket className="h-4 w-4" /> {t("contracts.bootstrap.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("contracts.bootstrap.alreadyBootstrapped")}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              navigate({
                to: "/projects/$projectId",
                params: { projectId: applied.target_project_id! },
              })
            }
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1" />
            {t("contracts.bootstrap.openProject")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const preview = previewQ.data?.preview ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Rocket className="h-4 w-4" /> {t("contracts.bootstrap.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t("contracts.bootstrap.subtitle")}
        </p>

        {previewQ.isLoading && (
          <p className="text-sm text-muted-foreground">
            {t("contracts.bootstrap.loadingPreview")}
          </p>
        )}

        {preview && (
          <div className="rounded-md border bg-muted/20 p-3 space-y-2 text-sm">
            <div className="font-medium">{t("contracts.bootstrap.previewTitle")}</div>
            <Row
              label={t("contracts.bootstrap.projectName")}
              value={preview.project.name}
            />
            <Row
              label={t("contracts.bootstrap.stagesCount")}
              value={String(preview.stages.length)}
            />
            <Row
              label={t("contracts.bootstrap.dependenciesCount")}
              value={String(preview.dependencies.length)}
            />
            {preview.warnings.length > 0 && (
              <BadgeRow
                label={t("contracts.bootstrap.warnings")}
                items={preview.warnings}
                variant="destructive"
              />
            )}
            {preview.skipped.length > 0 && (
              <BadgeRow
                label={t("contracts.bootstrap.skipped")}
                items={preview.skipped}
                variant="secondary"
              />
            )}
            {preview.unsupported.length > 0 && (
              <BadgeRow
                label={t("contracts.bootstrap.unsupported")}
                items={preview.unsupported}
                variant="outline"
              />
            )}
          </div>
        )}

        <Button
          size="sm"
          disabled={!preview || applyMut.isPending}
          onClick={() => {
            if (!window.confirm(t("contracts.bootstrap.applyConfirm"))) return;
            applyMut.mutate(
              { contractId },
              {
                onSuccess: (res) => {
                  toast.success(t("contracts.bootstrap.appliedToast"));
                  navigate({
                    to: "/projects/$projectId",
                    params: { projectId: res.projectId },
                  });
                },
                onError: (e: Error) => toast.error(e.message),
              },
            );
          }}
        >
          <Rocket className="h-3.5 w-3.5 mr-1" />
          {t("contracts.bootstrap.apply")}
        </Button>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b pb-1 last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}

function BadgeRow({
  label,
  items,
  variant,
}: {
  label: string;
  items: string[];
  variant: "default" | "secondary" | "destructive" | "outline";
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1">
      <span className="text-xs text-muted-foreground">{label}:</span>
      {items.map((it) => (
        <Badge key={it} variant={variant} className="text-[10px]">
          {it}
        </Badge>
      ))}
    </div>
  );
}
