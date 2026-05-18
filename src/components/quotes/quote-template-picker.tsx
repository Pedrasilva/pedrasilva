/**
 * QuoteTemplatePicker — optional template selector for quote creation.
 * Templates are grouped by category. Selecting one returns the template
 * id; "Blank" returns null. Pure presentation — instantiation happens
 * in the dialog that hosts this picker.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { FileText, Sparkles } from "lucide-react";
import {
  useQuoteTemplates,
  type QuoteTemplateCategory,
  type QuoteTemplateWithCounts,
} from "@/lib/quotes/quote-templates";

export function QuoteTemplatePicker({
  category,
  value,
  onChange,
}: {
  category: QuoteTemplateCategory;
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const { t } = useTranslation("crm");
  const { data: templates = [], isLoading } = useQuoteTemplates();

  const filtered = useMemo(
    () => templates.filter((tpl) => tpl.is_active && tpl.category === category),
    [templates, category],
  );

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={cn(
          "flex items-start gap-3 rounded-md border p-3 text-left transition-colors hover:bg-muted/50",
          value === null && "border-primary bg-primary/5",
        )}
      >
        <Sparkles className="mt-0.5 h-4 w-4 text-muted-foreground" />
        <div className="min-w-0">
          <div className="text-sm font-medium">{t("templates.picker.blankTitle")}</div>
          <div className="text-xs text-muted-foreground">{t("templates.picker.blankDescription")}</div>
        </div>
      </button>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("templates.picker.empty")}</p>
      ) : (
        filtered.map((tpl: QuoteTemplateWithCounts) => (
          <button
            key={tpl.id}
            type="button"
            onClick={() => onChange(tpl.id)}
            className={cn(
              "flex items-start gap-3 rounded-md border p-3 text-left transition-colors hover:bg-muted/50",
              value === tpl.id && "border-primary bg-primary/5",
            )}
          >
            <FileText className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium truncate">{tpl.name}</div>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t(`templates.projectType.${tpl.project_type}`)}
                </span>
              </div>
              {tpl.description && (
                <div className="text-xs text-muted-foreground line-clamp-2">{tpl.description}</div>
              )}
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span>{t("templates.picker.stagesCount", { count: tpl.stages_count })}</span>
                <span>{t("templates.picker.paymentRulesCount", { count: tpl.payment_rules_count })}</span>
                <span>{t("templates.picker.blocksCount", { count: tpl.blocks_count })}</span>
              </div>
            </div>
          </button>
        ))
      )}
    </div>
  );
}
