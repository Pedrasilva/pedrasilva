/**
 * Searchable supplier picker with inline-create.
 *
 * Behaviour:
 *  - Shows active suppliers; an extra non-clickable item is rendered when
 *    the currently linked supplier is archived (so legacy values stay
 *    visible).
 *  - Type a name with no exact match → "+ Create '<query>'" appears.
 *  - On inline create, auto-selects the new supplier.
 *  - "Clear" returns to legacy free-text mode (caller decides what to do).
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
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
import { useSuppliers, type Supplier } from "@/lib/projects/use-suppliers";
import { SupplierFormDialog } from "./supplier-form-dialog";

interface Props {
  value: string | null | undefined;
  onChange: (id: string | null, supplier: Supplier | null) => void;
  /** Fallback label when value is null but a legacy free-text exists. */
  legacyName?: string | null;
  /** Disable the picker (e.g. while parent dialog is submitting). */
  disabled?: boolean;
}

export function SupplierPicker({ value, onChange, legacyName, disabled }: Props) {
  const { t } = useTranslation("projects");
  // Always include inactive so an archived linked supplier still renders.
  const { data: all = [] } = useSuppliers({ includeInactive: true });
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const selected = useMemo(
    () => all.find((s) => s.id === value) ?? null,
    [all, value],
  );

  // Hide archived from the list unless they are currently selected.
  const visible = useMemo(() => {
    return all.filter((s) => s.active || s.id === value);
  }, [all, value]);

  const trimmed = search.trim();
  const exactMatch = trimmed
    ? visible.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())
    : false;
  const showCreate = trimmed.length > 0 && !exactMatch;

  const triggerLabel = selected
    ? selected.name + (selected.active ? "" : ` (${t("suppliers.archived")})`)
    : legacyName && legacyName.trim().length > 0
      ? `${legacyName} · ${t("suppliers.legacy")}`
      : t("suppliers.picker.placeholder");

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
              !selected && !legacyName && "text-muted-foreground",
            )}
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={true}>
            <CommandInput
              placeholder={t("suppliers.picker.searchPlaceholder")}
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>
                {showCreate ? null : t("suppliers.picker.empty")}
              </CommandEmpty>
              {(value || legacyName) && (
                <CommandGroup>
                  <CommandItem
                    value="__clear__"
                    onSelect={() => {
                      onChange(null, null);
                      setOpen(false);
                    }}
                  >
                    <span className="text-muted-foreground">
                      {t("suppliers.picker.clear")}
                    </span>
                  </CommandItem>
                </CommandGroup>
              )}
              {visible.length > 0 && (
                <CommandGroup heading={t("suppliers.picker.heading")}>
                  {visible.map((s) => (
                    <CommandItem
                      key={s.id}
                      value={s.name}
                      onSelect={() => {
                        onChange(s.id, s);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-3.5 w-3.5",
                          value === s.id ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="flex-1 truncate">{s.name}</span>
                      {!s.active && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {t("suppliers.archived")}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {showCreate && (
                <CommandGroup>
                  <CommandItem
                    value={`__create__${trimmed}`}
                    onSelect={() => {
                      setOpen(false);
                      setCreateOpen(true);
                    }}
                  >
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    {t("suppliers.picker.createInline", { name: trimmed })}
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <SupplierFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultName={trimmed}
        onSaved={(supplier) => {
          onChange(supplier.id, supplier);
          setSearch("");
        }}
      />
    </>
  );
}
