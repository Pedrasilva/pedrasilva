import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown, Plus, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { NewCompanyDialog } from "./new-company-dialog";

type CompanyLite = {
  id: string;
  nome: string;
  industria: string | null;
  status: string | null;
};

export interface CompanyPickerProps {
  value: string | null;
  onChange: (companyId: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export function CompanyPicker({
  value, onChange, placeholder, disabled, className,
}: CompanyPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-lite"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, nome, industria, status")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as CompanyLite[];
    },
  });

  const selected = useMemo(
    () => companies.find((c) => c.id === value) ?? null,
    [companies, value],
  );

  const trimmedSearch = search.trim();

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "w-full justify-between font-normal",
              !selected && "text-muted-foreground",
              className,
            )}
          >
            <span className="flex items-center gap-2 truncate">
              <Building2 className="h-4 w-4 shrink-0 opacity-60" />
              <span className="truncate">
                {selected
                  ? selected.nome
                  : (placeholder ?? t("common:companyPicker.search", "Search company…"))}
              </span>
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[280px] p-0" align="start">
          <Command>
            <CommandInput
              placeholder={t("common:companyPicker.search", "Search company…")}
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty className="py-3 px-2 text-xs text-muted-foreground">
                {t("common:companyPicker.empty", "No companies found")}
              </CommandEmpty>
              {companies.length > 0 && (
                <CommandGroup>
                  {companies.map((c) => {
                    const subtitle = [c.industria, c.status].filter(Boolean).join(" · ");
                    return (
                      <CommandItem
                        key={c.id}
                        value={`${c.nome} ${c.industria ?? ""}`}
                        onSelect={() => {
                          onChange(c.id);
                          setOpen(false);
                          setSearch("");
                        }}
                        className="flex items-start gap-2"
                      >
                        <Check
                          className={cn(
                            "mt-0.5 h-4 w-4",
                            value === c.id ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate">{c.nome}</span>
                          {subtitle && (
                            <span className="truncate text-xs text-muted-foreground">
                              {subtitle}
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  value="__create_new_company__"
                  onSelect={() => {
                    setOpen(false);
                    setCreateOpen(true);
                  }}
                  className="text-primary"
                >
                  <Plus className="h-4 w-4" />
                  <span className="truncate">
                    {trimmedSearch
                      ? t("common:companyPicker.createNewWith", "Create '{{name}}'", { name: trimmedSearch })
                      : t("common:companyPicker.createNew", "Create new company")}
                  </span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <NewCompanyDialog
        open={createOpen}
        defaultName={trimmedSearch}
        onClose={() => setCreateOpen(false)}
        onCreated={(companyId) => {
          onChange(companyId);
          setSearch("");
        }}
      />
    </>
  );
}
