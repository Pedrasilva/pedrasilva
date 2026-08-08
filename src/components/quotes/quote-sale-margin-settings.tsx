/**
 * Sale margin settings for a quote's planning chart.
 *
 * Default is the project-wide 50% markup on cost. A per-quote override lets
 * commercial teams price a specific client at a different margin without
 * touching HR rates.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Settings } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DEFAULT_SALE_MARGIN_PCT } from "@/lib/quotes/use-resource-pricing";
import {
  useQuoteSaleMargin,
  useSetQuoteSaleMargin,
} from "@/lib/quotes/use-quote-sale-margin";

export function QuoteSaleMarginSettings({ quoteId, disabled = false }: { quoteId: string; disabled?: boolean }) {
  const { t } = useTranslation("crm");
  const marginQ = useQuoteSaleMargin(quoteId);
  const setMargin = useSetQuoteSaleMargin(quoteId);

  const stored = marginQ.data ?? null;
  const [draft, setDraft] = useState<string>("");
  const [applyToExisting, setApplyToExisting] = useState(true);

  useEffect(() => {
    setDraft(
      stored == null
        ? String(DEFAULT_SALE_MARGIN_PCT * 100)
        : String(Math.round(stored * 1000) / 10),
    );
  }, [stored]);

  const save = async (value: number | null) => {
    try {
      await setMargin.mutateAsync({ marginPct: value, applyToExisting });
      toast.success(
        t("workspace.planning.saleMargin.saved", { defaultValue: "Sale margin updated" }),
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const pctLabel =
    stored == null
      ? `${Math.round(DEFAULT_SALE_MARGIN_PCT * 100)}%`
      : `${Math.round(stored * 1000) / 10}%`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          disabled={disabled}
          title={t("workspace.planning.saleMargin.tooltip", {
            defaultValue: "Sale margin applied to resource cost on this quote.",
          })}
        >
          <Settings className="mr-1 h-3.5 w-3.5" />
          {t("workspace.planning.saleMargin.button", { defaultValue: "Margin" })}
          <span className="ml-1 font-mono">{pctLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div>
          <div className="text-sm font-semibold">
            {t("workspace.planning.saleMargin.title", { defaultValue: "Sale margin" })}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("workspace.planning.saleMargin.hint", {
              defaultValue:
                "Sale rate = cost × (1 + margin). Default is 50%; set a different value for this quote only.",
            })}
          </p>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">
            {t("workspace.planning.saleMargin.field", { defaultValue: "Margin (%)" })}
          </Label>
          <Input
            type="number"
            min={0}
            step={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-8"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs font-normal">
            {t("workspace.planning.saleMargin.applyExisting", {
              defaultValue: "Re-price existing allocations",
            })}
          </Label>
          <Switch checked={applyToExisting} onCheckedChange={setApplyToExisting} />
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={setMargin.isPending}
            onClick={() => save(null)}
          >
            {t("workspace.planning.saleMargin.reset", { defaultValue: "Use default (50%)" })}
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 px-3 text-xs"
            disabled={setMargin.isPending}
            onClick={() => {
              const n = Number(draft);
              if (!Number.isFinite(n) || n < 0) {
                toast.error(
                  t("workspace.planning.saleMargin.invalid", {
                    defaultValue: "Enter a valid percentage.",
                  }),
                );
                return;
              }
              save(n / 100);
            }}
          >
            {t("workspace.planning.saleMargin.save", { defaultValue: "Save" })}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
