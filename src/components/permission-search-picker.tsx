import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { matchesPickerSearch } from '@/lib/permission-picker-search';

export interface PermissionPickerOption {
  value: string;
  label: string;
  group?: string;
  searchLabels: string[];
  tags?: string[];
}

export function PermissionSearchPicker({ value, onValueChange, options, placeholder, disabled, className }: {
  value: string;
  onValueChange: (value: string) => void;
  options: PermissionPickerOption[];
  placeholder: string;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = options.filter(option => matchesPickerSearch(query, option.searchLabels));
  const groups = [...new Set(filtered.map(option => option.group ?? ''))];
  return <Popover open={open} onOpenChange={next => { setOpen(next); setQuery(''); }}>
    <PopoverTrigger asChild>
      <Button variant="outline" role="combobox" aria-label={placeholder} aria-expanded={open} disabled={disabled} className={className ?? 'w-full justify-between gap-2 font-normal'}>
        <span className="truncate">{options.find(option => option.value === value)?.label ?? placeholder}</span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-72 max-w-[calc(100vw-2rem)] p-0">
      <Command shouldFilter={false}>
        <CommandInput aria-label={t('common:searchPlaceholder')} placeholder={t('common:searchPlaceholder')} value={query} onValueChange={setQuery} />
        <CommandList>
          <CommandEmpty>{t('common:noResults')}</CommandEmpty>
          {groups.map(group => <CommandGroup key={group} heading={group || undefined}>
            {filtered.filter(option => (option.group ?? '') === group).map(option => <CommandItem key={option.value} value={option.value} onSelect={() => { onValueChange(option.value); setOpen(false); setQuery(''); }}>
              <span className="min-w-0 flex-1">{option.label}</span>
              <span className="flex shrink-0 flex-wrap gap-1">{option.tags?.map(tag => <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>)}</span>
            </CommandItem>)}
          </CommandGroup>)}
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}