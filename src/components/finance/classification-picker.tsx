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
  options,
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

  const byId = useMemo(() => new Map(options.map((c) => [c.id, c])), [options]);

  const selected = useMemo(
    () => (value ? byId.get(value) ?? null : null),
    [byId, value],
  );

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) {
      return [...options].sort((a, b) => a.code.localeCompare(b.code));
    }
    return options
      .filter((c) => matches(q, c))
      .sort((a, b) => {
        const r = rank(q, a, isPt) - rank(q, b, isPt);
        if (r !== 0) return r;
        return a.code.localeCompare(b.code);
      });
  }, [options, search, isPt]);

  const isSearching = search.trim().length > 0;
  const suggestedItems = useMemo(() => {
    if (isSearching || !suggestedIds?.length) return [];
    const seen = new Set<string>();
    const out: ClassificationOption[] = [];
    for (const id of suggestedIds) {
      if (seen.has(id)) continue;
      const c = byId.get(id);
      if (c) {
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
      if (c) out.push(c);
    }
    return out;
  }, [isSearching, recent, suggestedItems, byId]);

  const triggerLabel = selected
    ? `${selected.code} · ${isPt ? selected.name_pt : selected.name_en}`
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
          <span className="font-semibold text-xs tracking-wide truncate">{c.code}</span>
          <span className="text-xs text-muted-foreground truncate">
            {isPt ? c.name_pt : c.name_en}
          </span>
        </div>
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
      <ClassificationBrowser open={browserOpen} onOpenChange={setBrowserOpen} />
    </>
  );
}
