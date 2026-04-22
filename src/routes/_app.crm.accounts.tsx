import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Receipt } from "lucide-react";
import { toast } from "sonner";
import { CompanyPicker } from "@/components/crm/company-picker";
import type { CrmAccount } from "@/lib/crm/types";

export const Route = createFileRoute("/_app/crm/accounts")({
  component: AccountsPage,
});

type Row = CrmAccount & { company: { id: string; nome: string } | null };

function AccountsPage() {
  const [open, setOpen] = useState(false);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["crm_accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_accounts")
        .select("*, company:companies(id, nome)")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{accounts.length} accounts</div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New account
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-sm text-muted-foreground">
            <Receipt className="h-8 w-8 opacity-50" />
            No billing accounts yet. Accounts represent the entity you invoice
            (a company can have multiple).
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2">Billing details</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="border-b hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <Link
                        to="/crm/accounts/$accountId"
                        params={{ accountId: a.id }}
                        className="font-medium hover:underline"
                      >
                        {a.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{a.company?.nome ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground line-clamp-1">
                      {a.billing_details ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <NewAccountDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function NewAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();

  const [form, setForm] = useState({
    name: "",
    company_id: "",
    billing_details: "",
    notas: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Name is required");
      if (!form.company_id) throw new Error("Company is required");
      const { error } = await supabase.from("crm_accounts").insert({
        name: form.name.trim(),
        company_id: form.company_id,
        billing_details: form.billing_details || null,
        notas: form.notas || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Account created");
      qc.invalidateQueries({ queryKey: ["crm_accounts"] });
      setForm({ name: "", company_id: "", billing_details: "", notas: "" });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New account</DialogTitle>
          <DialogDescription>
            A billing entity tied to a company. Quotes are approved against an account.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Name *</Label>
            <Input
              placeholder="e.g. ACME SA — Lisbon billing"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <Label>Company *</Label>
            <CompanyPicker
              value={form.company_id || null}
              onChange={(id) => setForm((f) => ({ ...f, company_id: id }))}
              placeholder="Select or create company"
            />
          </div>
          <div>
            <Label>Billing details</Label>
            <Textarea
              rows={3}
              placeholder="NIF, billing address, IBAN, etc."
              value={form.billing_details}
              onChange={(e) => setForm((f) => ({ ...f, billing_details: e.target.value }))}
            />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              rows={2}
              value={form.notas}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || !form.name.trim() || !form.company_id}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
