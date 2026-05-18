/**
 * Quote Templates — minimal list view.
 *
 * Read-only at this stage: shows what has been saved via "Save as template"
 * from the quote workspace. No edit/delete/versioning yet — those are
 * deferred until the foundation is exercised end-to-end.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useQuoteTemplates } from "@/lib/quotes/quote-templates";

export const Route = createFileRoute("/_app/crm/quote-templates")({
  component: QuoteTemplatesPage,
});

function QuoteTemplatesPage() {
  const { t, i18n } = useTranslation("crm");
  const { data: templates = [], isLoading } = useQuoteTemplates();

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language === "pt-PT" ? "pt-PT" : undefined);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          {t("templates.list.title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("templates.list.description")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("templates.list.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : templates.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center">
              <p className="text-sm font-medium">{t("templates.list.empty.title")}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("templates.list.empty.hint")}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("templates.list.columns.name")}</TableHead>
                  <TableHead>{t("templates.list.columns.category")}</TableHead>
                  <TableHead>{t("templates.list.columns.projectType")}</TableHead>
                  <TableHead className="text-right">{t("templates.list.columns.stages")}</TableHead>
                  <TableHead className="text-right">{t("templates.list.columns.rules")}</TableHead>
                  <TableHead className="text-right">{t("templates.list.columns.blocks")}</TableHead>
                  <TableHead>{t("templates.list.columns.status")}</TableHead>
                  <TableHead>{t("templates.list.columns.updated")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((tpl) => (
                  <TableRow key={tpl.id}>
                    <TableCell>
                      <div className="font-medium">{tpl.name}</div>
                      {tpl.description && (
                        <div className="text-xs text-muted-foreground line-clamp-2">
                          {tpl.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{t(`templates.category.${tpl.category}`)}</TableCell>
                    <TableCell>{t(`templates.projectType.${tpl.project_type}`)}</TableCell>
                    <TableCell className="text-right tabular-nums">{tpl.stages_count}</TableCell>
                    <TableCell className="text-right tabular-nums">{tpl.payment_rules_count}</TableCell>
                    <TableCell className="text-right tabular-nums">{tpl.blocks_count}</TableCell>
                    <TableCell>
                      <span
                        className={
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] " +
                          (tpl.is_active
                            ? "border-emerald-600/30 text-emerald-700 dark:text-emerald-400"
                            : "border-muted text-muted-foreground")
                        }
                      >
                        {t(tpl.is_active ? "templates.list.status.active" : "templates.list.status.inactive")}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {fmtDate(tpl.updated_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
