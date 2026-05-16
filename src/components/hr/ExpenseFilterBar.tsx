import { Search, Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  type BenefitCategoryRow,
  type ExpenseStatus,
} from "@/lib/benefits";

export type ExpenseFilterState = {
  search: string;
  estado: ExpenseStatus | "todos";
  categoryCode: string | "all";
  year: number | "all";
};

/**
 * Shared filter bar used by collaborator / approver / admin views.
 * Keeps filter UI consistent and avoids duplicated state shape.
 */
export function ExpenseFilterBar({
  value,
  onChange,
  categories,
  years,
  onExportCsv,
  exportDisabled,
  showChips = false,
}: {
  value: ExpenseFilterState;
  onChange: (next: ExpenseFilterState) => void;
  categories: BenefitCategoryRow[];
  years: number[];
  onExportCsv?: () => void;
  exportDisabled?: boolean;
  showChips?: boolean;
}) {
  const { t, i18n } = useTranslation(["hr"]);
  const isEn = i18n.language?.startsWith("en");
  const set = <K extends keyof ExpenseFilterState>(k: K, v: ExpenseFilterState[K]) =>
    onChange({ ...value, [k]: v });

  const chipOptions: Array<{ key: ExpenseStatus | "todos"; labelKey: string }> = [
    { key: "pendente", labelKey: "hr:beneficios.filters.chipPending" },
    { key: "aprovada", labelKey: "hr:beneficios.filters.chipApproved" },
    { key: "paga", labelKey: "hr:beneficios.filters.chipPaid" },
    { key: "rejeitada", labelKey: "hr:beneficios.filters.chipRejected" },
    { key: "todos", labelKey: "hr:beneficios.filters.chipAll" },
  ];

  return (
    <div className="space-y-2">
      {showChips && (
        <div className="flex flex-wrap gap-1.5">
          {chipOptions.map((c) => {
            const active = value.estado === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => set("estado", c.key)}
                className="focus:outline-none"
              >
                <Badge
                  variant={active ? "default" : "outline"}
                  className={cn("cursor-pointer font-normal", active && "shadow-sm")}
                >
                  {t(c.labelKey)}
                </Badge>
              </button>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-7"
            placeholder={t("hr:beneficios.filters.searchPlaceholder")}
            value={value.search}
            onChange={(e) => set("search", e.target.value)}
          />
        </div>
        {!showChips && (
          <Select
            value={value.estado}
            onValueChange={(v) => set("estado", v as ExpenseStatus | "todos")}
          >
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">{t("hr:beneficios.filters.allStatuses")}</SelectItem>
              <SelectItem value="pendente">{t("hr:beneficios.status.pendente")}</SelectItem>
              <SelectItem value="aprovada">{t("hr:beneficios.status.aprovada")}</SelectItem>
              <SelectItem value="paga">{t("hr:beneficios.status.paga")}</SelectItem>
              <SelectItem value="rejeitada">{t("hr:beneficios.status.rejeitada")}</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Select value={value.categoryCode} onValueChange={(v) => set("categoryCode", v)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("hr:beneficios.filters.allCategories")}</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.code}>
                {isEn ? c.label_en : c.label_pt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={String(value.year)}
          onValueChange={(v) => set("year", v === "all" ? "all" : Number(v))}
        >
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("hr:beneficios.filters.allYears")}</SelectItem>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {onExportCsv && (
          <Button
            variant="outline"
            size="sm"
            onClick={onExportCsv}
            disabled={exportDisabled}
          >
            <Download className="h-4 w-4" /> {t("hr:beneficios.filters.exportCsv")}
          </Button>
        )}
      </div>
    </div>
  );
}
