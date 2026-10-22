import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { format, parseISO } from "date-fns";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDateLocale } from "@/i18n/use-date-locale";
import { useMyPostApprovals } from "@/lib/marketing/use-post-approvals";

/** Post approvals block on the shared approvals page; renders nothing without pending items. */
export function PostApprovalsSection() {
  const { t } = useTranslation("marketing");
  const locale = useDateLocale();
  const { rows } = useMyPostApprovals();
  if (!rows.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Megaphone className="h-5 w-5" />{t("approval.inboxTitle", { count: rows.length })}</h2>
      <div className="overflow-x-auto border-y">
        <Table>
          <TableHeader><TableRow>
            {[t("approval.requester"), t("approval.post"), t("actions.project"), t("approval.comment"), t("approval.requestedOn"), ""].map((h, i) => <TableHead key={i}>{h}</TableHead>)}
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.requester}</TableCell>
                <TableCell className="max-w-96"><span className="text-xs text-muted-foreground">{t(`posts.platform.${r.platform}`)}</span><p className="line-clamp-2 text-sm">{r.excerpt}</p></TableCell>
                <TableCell>{r.projectName ?? "—"}</TableCell>
                <TableCell className="max-w-60 text-xs">{r.comment ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap">{format(parseISO(r.createdAt), "dd/MM/yyyy", { locale })}</TableCell>
                <TableCell><Button asChild size="sm"><Link to="/marketing/posts" search={{ draft: r.draftId }}>{t("approval.review")}</Link></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
