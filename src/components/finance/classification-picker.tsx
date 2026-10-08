/**
 * Searchable classification picker.
 *
 * Filters by code, name_pt, name_en. Sorting:
 *  - default: by code
 *  - while searching: startsWith > includes
 *
 * Display: bold CODE on top, muted name underneath.
 *
 * Extras:
 *  - "Recent" section (last ~8 selections, persisted in localStorage)
 *  - Optional `suggestedIds` (e.g. derived from supplier) shown above Recent
 *  - "Browse all…" button opens a read-only Classification Browser
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronsUpDown, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ClassificationBrowser } from "./classification-browser";

export type ClassificationOption = {
  id: string;
  code: string;
  name_pt: string;
  name_en: string;
};

interface Props {
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  options: ClassificationOption[];
  isPt?: boolean;
  disabled?: boolean;
  allowClear?: boolean;
  placeholder?: string;
  className?: string;
  /** Optional suggestion IDs (e.g. derived from selected supplier). Shown above Recent. */
  suggestedIds?: string[];
}

const RECENT_KEY = "lovable.finance.recentClassifications";
const RECENT_MAX = 8;

function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function pushRecent(id: string) {
  if (typeof window === "undefined") return;
  try {
    const cur = loadRecent().filter((x) => x !== id);
    cur.unshift(id);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, RECENT_MAX)));
  } catch {
    /* ignore */
  }
}

function rank(query: string, c: ClassificationOption, isPt: boolean): number {
  const q = query.toLowerCase();
  const code = c.code.toLowerCase();
  const name = (isPt ? c.name_pt : c.name_en).toLowerCase();
  const altName = (isPt ? c.name_en : c.name_pt).toLowerCase();
  if (code.startsWith(q)) return 0;
  if (name.startsWith(q)) return 1;
  if (altName.startsWith(q)) return 2;
  if (code.includes(q)) return 3;
  if (name.includes(q)) return 4;
  if (altName.includes(q)) return 5;
  return 99;
}

function matches(query: string, c: ClassificationOption): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    c.code.toLowerCase().includes(q) ||
    c.name_pt.toLowerCase().includes(q) ||
    c.name_en.toLowerCase().includes(q)
  );
}

export function ClassificationPicker({
  value,
  onChange,
  options: optionsProp,
  isPt = false,
  disabled,
  allowClear = false,
  placeholder,
  className,
  suggestedIds,
}: Props) {
  const { t } = useTranslation("finance");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const [browserOpen, setBrowserOpen] = useState(false);

  // Refresh recent each time the popover opens (catches sibling updates)
  useEffect(() => {
    if (open) setRecent(loadRecent());
  }, [open]);

  // Tree metadata for the current entity (RLS scopes it): only active categories
  // can be chosen, shown as "Grupo › Categoria" with the category's default policy.
  const metaQ = useQuery({
    queryKey: ["classification-picker-meta"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_classifications")
        .select("id, level, parent_id, active, spending_policy, name_pt, name_en, sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
  const meta = useMemo(() => new Map((metaQ.data ?? []).map((m) => [m.id, m])), [metaQ.data]);
  const groupLabel = (c: ClassificationOption) => {
    const m = meta.get(c.id);
    const g = m?.parent_id ? meta.get(m.parent_id) : null;
    return g ? (isPt ? g.name_pt : g.name_en) : null;
  };
  const policyOf = (id: string) => meta.get(id)?.spending_policy ?? null;
  const allOptions = optionsProp;
  const options = useMemo(
    () =>
      metaQ.data
        ? allOptions.filter((c) => {
            const m = meta.get(c.id);
            return m ? m.level === "category" && m.active : false;
          })
        : allOptions,
    [allOptions, meta, metaQ.data],
  );

  const byId = useMemo(() => new Map(allOptions.map((c) => [c.id, c])), [allOptions]);

  const selected = useMemo(
    () => (value ? byId.get(value) ?? null : null),
    [byId, value],
  );

  const groupMatches = (q: string, c: ClassificationOption) =>
    (groupLabel(c) ?? "").toLowerCase().includes(q.toLowerCase());
  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) {
      return [...options].sort((a, b) => {
        const sa = meta.get(a.id)?.sort_order ?? 0;
        const sb = meta.get(b.id)?.sort_order ?? 0;
        return sa - sb || a.code.localeCompare(b.code);
      });
    }
    return options
      .filter((c) => matches(q, c) || groupMatches(q, c))
      .sort((a, b) => {
        const r = rank(q, a, isPt) - rank(q, b, isPt);
        if (r !== 0) return r;
        return a.code.localeCompare(b.code);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, search, isPt, meta]);

  const isSearching = search.trim().length > 0;
  const suggestedItems = useMemo(() => {
    if (isSearching || !suggestedIds?.length) return [];
    const seen = new Set<string>();
    const out: ClassificationOption[] = [];
    for (const id of suggestedIds) {
      if (seen.has(id)) continue;
      const c = byId.get(id);
      if (c && options.includes(c)) {
        out.push(c);
        seen.add(id);
      }
    }
    return out;
  }, [isSearching, suggestedIds, byId]);

  const recentItems = useMemo(() => {
    if (isSearching) return [];
    const skip = new Set(suggestedItems.map((c) => c.id));
    const out: ClassificationOption[] = [];
    for (const id of recent) {
      if (skip.has(id)) continue;
      const c = byId.get(id);
      if (c && options.includes(c)) out.push(c);
    }
    return out;
  }, [isSearching, recent, suggestedItems, byId]);

  const triggerLabel = selected
    ? `${groupLabel(selected) ? `${groupLabel(selected)} › ` : ""}${isPt ? selected.name_pt : selected.name_en}`
    : (placeholder ?? t("classificationPicker.placeholder"));

  function handleSelect(id: string) {
    pushRecent(id);
    setRecent(loadRecent());
    onChange(id);
    setOpen(false);
    setSearch("");
  }

  function renderItem(c: ClassificationOption) {
    return (
      <CommandItem
        key={c.id}
        value={c.id}
        onSelect={() => handleSelect(c.id)}
        className="flex items-start gap-2"
      >
        <Check
          className={cn(
            "mt-0.5 h-3.5 w-3.5 shrink-0",
            value === c.id ? "opacity-100" : "opacity-0",
          )}
        />
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-xs truncate">
            {groupLabel(c) && <span className="text-muted-foreground">{groupLabel(c)} › </span>}
            <span className="font-medium">{isPt ? c.name_pt : c.name_en}</span>
          </span>
          <span className="text-[10px] text-muted-foreground tracking-wide truncate">{c.code}</span>
        </div>
        {policyOf(c.id) && (
          <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
            {t(`policies.${policyOf(c.id)}`)}
          </Badge>
        )}
      </CommandItem>
    );
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            disabled={disabled}
            className={cn(
              "w-full justify-between font-normal",
              !selected && "text-muted-foreground",
              className,
            )}
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] min-w-[320px] p-0"
          align="start"
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={t("classificationPicker.searchPlaceholder")}
              value={search}
              onValueChange={setSearch}
            />
            <CommandList className="max-h-[360px]">
              <CommandEmpty>{t("classificationPicker.empty")}</CommandEmpty>

              {allowClear && value && (
                <CommandGroup>
                  <CommandItem
                    value="__clear__"
                    onSelect={() => {
                      onChange(null);
                      setOpen(false);
                    }}
                  >
                    <span className="text-muted-foreground">
                      {t("classificationPicker.clear")}
                    </span>
                  </CommandItem>
                </CommandGroup>
              )}

              {suggestedItems.length > 0 && (
                <>
                  <CommandGroup heading={t("classificationPicker.suggested")}>
                    {suggestedItems.map(renderItem)}
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}

              {recentItems.length > 0 && (
                <>
                  <CommandGroup heading={t("classificationPicker.recent")}>
                    {recentItems.map(renderItem)}
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}

              {filtered.length > 0 && (
                <CommandGroup
                  heading={
                    isSearching || suggestedItems.length || recentItems.length
                      ? t("classificationPicker.all")
                      : undefined
                  }
                >
                  {filtered.map(renderItem)}
                </CommandGroup>
              )}
            </CommandList>
            <div className="border-t p-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs text-muted-foreground"
                onClick={() => {
                  setOpen(false);
                  setBrowserOpen(true);
                }}
              >
                <BookOpen className="h-3.5 w-3.5 mr-2" />
                {t("classificationPicker.browseAll")}
              </Button>
            </div>
          </Command>
        </PopoverContent>
      </Popover>
      {selected && policyOf(selected.id) && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t(`policies.${policyOf(selected.id)}`)} — {t(`policies.${policyOf(selected.id)}Hint`)}
        </p>
      )}
      <ClassificationBrowser open={browserOpen} onOpenChange={setBrowserOpen} />
    </>
  );
}
