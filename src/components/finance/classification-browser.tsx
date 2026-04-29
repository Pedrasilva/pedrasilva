/**
 * Read-only Classification Browser.
 * Searchable table of all financial_classifications.
 * Shows: code, name (PT/EN), spending_policy. No editing, no DB changes.
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Row = {
  id: string;
  code: string;
  name_pt: string;
  name_en: string;
  spending_policy: string;
  financial_nature: string | null;
  active: boolean;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ClassificationBrowser({ open, onOpenChange }: Props) {
  const { t, i18n } = useTranslation("finance");
  const isPt = i18n.language?.startsWith("pt");
  const [q, setQ] = useState("");

  const dataQ = useQuery({
    queryKey: ["finance", "classifications", "browser"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_classifications")
        .select("id, code, name_pt, name_en, spending_policy, financial_nature, active")
        .order("code");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const filtered = useMemo(() => {
    const all = dataQ.data ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (r) =>
        r.code.toLowerCase().includes(needle) ||
        r.name_pt.toLowerCase().includes(needle) ||
        r.name_en.toLowerCase().includes(needle),
    );
  }, [dataQ.data, q]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t("classificationBrowser.title")}</DialogTitle>
          <DialogDescription>{t("classificationBrowser.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("classificationBrowser.searchPlaceholder")}
            className="pl-8"
          />
        </div>

        <div className="max-h-[480px] overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead className="w-[180px]">{t("classificationBrowser.code")}</TableHead>
                <TableHead>{t("classificationBrowser.name")}</TableHead>
                <TableHead className="w-[160px]">{t("classificationBrowser.spendingPolicy")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dataQ.isLoading && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground text-sm">
                    {t("classificationBrowser.loading")}
                  </TableCell>
                </TableRow>
              )}
              {!dataQ.isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground text-sm">
                    {t("classificationBrowser.empty")}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs font-semibold">{r.code}</TableCell>
                  <TableCell>
                    <div className="text-sm">{isPt ? r.name_pt : r.name_en}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {isPt ? r.name_en : r.name_pt}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[11px] capitalize">
                      {r.spending_policy}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
