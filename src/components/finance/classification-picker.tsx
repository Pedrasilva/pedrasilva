/**
 * Searchable classification picker.
 *
 * Filters by code, name_pt, name_en. Sorting:
 *  - default: by code
 *  - while searching: startsWith > includes
 *
 * Display: bold CODE on top, muted name underneath.
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

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
}: Props) {
  const { t } = useTranslation("finance");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = useMemo(
    () => options.find((c) => c.id === value) ?? null,
    [options, value],
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

  const triggerLabel = selected
    ? `${selected.code} · ${isPt ? selected.name_pt : selected.name_en}`
    : (placeholder ?? t("classificationPicker.placeholder"));

  return (
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
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[320px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t("classificationPicker.searchPlaceholder")}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-[320px]">
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
            {filtered.length > 0 && (
              <CommandGroup>
                {filtered.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={c.id}
                    onSelect={() => {
                      onChange(c.id);
                      setOpen(false);
                      setSearch("");
                    }}
                    className="flex items-start gap-2"
                  >
                    <Check
                      className={cn(
                        "mt-0.5 h-3.5 w-3.5 shrink-0",
                        value === c.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-semibold text-xs tracking-wide truncate">
                        {c.code}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">
                        {isPt ? c.name_pt : c.name_en}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
