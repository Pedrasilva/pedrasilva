/**
 * Classification Browser.
 * - Reference mode (no onSelect): read-only searchable table of all categories.
 * - Picker mode (onSelect given, opened from a form): only selectable categories,
 *   click / Enter chooses one, fills the field and closes; current value highlighted;
 *   learned/suggested categories ranked first.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Search, Check, Sparkles } from "lucide-react";

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
import { cn } from "@/lib/utils";
import { rankForBrowser } from "@/lib/finance/classification-rank";

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
  /** When set, the browser acts as a picker. */
  onSelect?: (id: string) => void;
  selectedId?: string | null;
  /** Picker mode: only these ids can be chosen (e.g. active categories). */
  selectableIds?: string[];
  /** Ranked first (learned rules / supplier history). */
  suggestedIds?: string[];
}

export function ClassificationBrowser({ open, onOpenChange, onSelect, selectedId, selectableIds, suggestedIds }: Props) {
  const { t, i18n } = useTranslation("finance");
  const isPt = i18n.language?.startsWith("pt");
  const picking = !!onSelect;
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const bodyRef = useRef<HTMLTableSectionElement>(null);

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
    let all = dataQ.data ?? [];
    if (picking && selectableIds) {
      const allow = new Set(selectableIds);
      all = all.filter((r) => allow.has(r.id));
    }
    return rankForBrowser(all, q, !!isPt, picking ? suggestedIds ?? [] : []);
  }, [dataQ.data, q, isPt, picking, selectableIds, suggestedIds]);

  const suggestedSet = useMemo(() => new Set(suggestedIds ?? []), [suggestedIds]);

  // Reset search; put the cursor on the current value when opening.
  useEffect(() => {
    if (open) setQ("");
  }, [open]);
  useEffect(() => {
    const idx = selectedId && !q ? filtered.findIndex((r) => r.id === selectedId) : 0;
    setCursor(idx >= 0 ? idx : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open, dataQ.data]);
  useEffect(() => {
    bodyRef.current?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  function choose(id: string) {
    if (!onSelect) return;
    onSelect(id);
    onOpenChange(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!picking || filtered.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(filtered.length - 1, c + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); const r = filtered[cursor]; if (r) choose(r.id); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t(picking ? "classificationBrowser.pickTitle" : "classificationBrowser.title")}</DialogTitle>
          <DialogDescription>{t(picking ? "classificationBrowser.pickSubtitle" : "classificationBrowser.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
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
            <TableBody ref={bodyRef}>
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
              {filtered.map((r, i) => {
                const isSel = picking && r.id === selectedId;
                const isCur = picking && i === cursor;
                return (
                  <TableRow
                    key={r.id}
                    data-idx={i}
                    aria-selected={isSel || undefined}
                    onClick={picking ? () => choose(r.id) : undefined}
                    onMouseEnter={picking ? () => setCursor(i) : undefined}
                    className={cn(
                      picking && "cursor-pointer",
                      isCur && "bg-muted",
                      isSel && "bg-primary/10 font-medium",
                    )}
                  >
                    <TableCell className="font-mono text-xs font-semibold">
                      <span className="inline-flex items-center gap-1">
                        {isSel && <Check className="h-3.5 w-3.5 text-primary" />}
                        {r.code}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm flex items-center gap-1.5">
                        {isPt ? r.name_pt : r.name_en}
                        {picking && suggestedSet.has(r.id) && (
                          <Badge variant="secondary" className="text-[10px] gap-1">
                            <Sparkles className="h-3 w-3" />{t("classificationPicker.suggested")}
                          </Badge>
                        )}
                      </div>
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
                );
              })}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
