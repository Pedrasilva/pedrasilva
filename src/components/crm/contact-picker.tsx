import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown, Plus, User } from "lucide-react";
import { toast } from '@/lib/toast';
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CompanyPicker } from "./company-picker";
import { contactFullName } from "@/lib/crm/types";
import { splitContactName } from "@/lib/crm/contact-name";

type ContactLite = { id: string; primeiro_nome: string; apelido: string | null; titulo: string | null; company_id: string | null; email: string | null };

export type NewContactInput = { name: string; email: string; phone: string; companyId: string | null };

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: NewContactInput) => {
      const { primeiro_nome, apelido } = splitContactName(v.name);
      if (!primeiro_nome) throw new Error("name");
      const { data, error } = await supabase.from("contacts").insert({
        primeiro_nome, apelido, email: v.email.trim() || null, telefone: v.phone.trim() || null, company_id: v.companyId,
      }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts-lite"] });
      qc.invalidateQueries({ queryKey: ["contacts-by-company"] });
    },
  });
}

/** Contact search that works with or without a company; can create contacts inline. */
export function ContactPicker({ value, companyId, onChange, initial }: {
  value: string | null;
  companyId: string | null;
  onChange: (contactId: string | null, companyId: string | null) => void;
  initial?: Partial<NewContactInput>;
}) {
  const { t } = useTranslation("crm");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts-lite"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("id, primeiro_nome, apelido, titulo, company_id, email").order("primeiro_nome");
      if (error) throw error;
      return (data ?? []) as ContactLite[];
    },
  });
  const list = useMemo(() => {
    if (!companyId) return contacts;
    // company contacts first, others after
    return [...contacts].sort((a, b) => Number(b.company_id === companyId) - Number(a.company_id === companyId));
  }, [contacts, companyId]);
  const selected = contacts.find((c) => c.id === value) ?? null;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox" className={cn("h-8 mt-1 w-full justify-between font-normal", !selected && "text-muted-foreground")}>
            <span className="flex items-center gap-2 truncate"><User className="h-4 w-4 opacity-60" />{selected ? contactFullName(selected) : "—"}</span>
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[280px] p-0" align="start">
          <Command>
            <CommandInput placeholder={t("opportunities.contactPicker.search")} value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty className="py-3 px-2 text-xs text-muted-foreground">{t("opportunities.contactPicker.empty")}</CommandEmpty>
              <CommandGroup>
                <CommandItem value="__none__" onSelect={() => { onChange(null, companyId); setOpen(false); }}>—</CommandItem>
                {list.map((c) => (
                  <CommandItem key={c.id} value={`${contactFullName(c)} ${c.email ?? ""} ${c.id}`} onSelect={() => { onChange(c.id, companyId ?? c.company_id); setOpen(false); setSearch(""); }}>
                    <Check className={cn("h-4 w-4", value === c.id ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{contactFullName(c)}</span>
                    {c.email && <span className="ml-auto truncate text-xs text-muted-foreground">{c.email}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem value="__create_contact__" className="text-primary" onSelect={() => { setOpen(false); setCreateOpen(true); }}>
                  <Plus className="h-4 w-4" />{t("opportunities.contactPicker.newContact")}
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <NewContactDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        initial={{ ...initial, name: search.trim() || initial?.name || "", companyId: companyId ?? initial?.companyId ?? null }}
        onCreated={(id, cid) => { onChange(id, companyId ?? cid); setSearch(""); }}
      />
    </>
  );
}

export function NewContactDialog({ open, onClose, initial, onCreated }: {
  open: boolean; onClose: () => void; initial?: Partial<NewContactInput>; onCreated: (contactId: string, companyId: string | null) => void;
}) {
  const { t } = useTranslation("crm");
  const create = useCreateContact();
  const [form, setForm] = useState<NewContactInput>({ name: "", email: "", phone: "", companyId: null });
  const [key, setKey] = useState(false);
  if (open && !key) {
    setKey(true);
    setForm({ name: initial?.name ?? "", email: initial?.email ?? "", phone: initial?.phone ?? "", companyId: initial?.companyId ?? null });
  }
  if (!open && key) setKey(false);
  const submit = () => {
    if (!form.name.trim()) { toast.error(t("opportunities.contactPicker.nameRequired")); return; }
    create.mutate(form, {
      onSuccess: (id) => { toast.success(t("opportunities.contactPicker.created")); onCreated(id, form.companyId); onClose(); },
      onError: (e: Error) => toast.error(e.message),
    });
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("opportunities.contactPicker.newContactTitle")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>{t("opportunities.contactPicker.name")}</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>{t("opportunities.contactPicker.email")}</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label>{t("opportunities.contactPicker.phone")}</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>{t("opportunities.contactPicker.company")}</Label><CompanyPicker value={form.companyId} onChange={(cid) => setForm({ ...form, companyId: cid })} /></div>
        </div>
        <DialogFooter><Button onClick={submit} disabled={create.isPending}>{t("opportunities.contactPicker.create")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
