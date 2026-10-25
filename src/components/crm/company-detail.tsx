import { formatEUR } from "@/lib/product-ui-format";
import { useTranslation } from "react-i18next";
import uiI18n from "@/i18n/index";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRecordRecentlyViewed } from "@/hooks/use-recently-viewed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SettlementWorkspace } from "@/components/finance/settlement-workspace";
import { ArrowLeft, Building2, Trash2, Save, Users, GitBranch, Receipt, Wallet } from "lucide-react";
import { toast } from "sonner";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { CompanyProjectsTab } from "@/components/crm/company-projects-tab";
import { PaymentsReceived } from "@/components/finance/recebimentos-panel";

import { StatementView } from "@/components/finance/statement-view";
import { useCounterpartyStatement } from "@/lib/finance/use-documents";
import {
  contactFullName,  PIPELINE_STATUSES,
  type Company, type Contact, type FeeProposal} from "@/lib/crm/types";
import { relationshipLabel, statementSideOf, relationshipOf, relationshipVariant } from "@/lib/crm/relationship";
import { Switch } from "@/components/ui/switch";


export type CompanyDetailBack = {
  /** Where the "back" link and post-delete navigation should go. */
  to: string;
  label: string;
};

export function CompanyDetail({
  companyId,
  back,
}: {
  companyId: string;
  back: CompanyDetailBack;
}) {
  useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: company, isLoading } = useQuery({
    queryKey: ["company", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").eq("id", companyId).single();
      if (error) throw error;
      return data as Company;
    },
  });

  useRecordRecentlyViewed({
    module: "crm",
    href: `/crm/companies/${companyId}`,
    label: company?.nome ?? "",
  });



  const { data: contacts = [] } = useQuery({
    queryKey: ["company-contacts", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts").select("*").eq("company_id", companyId).order("primeiro_nome");
      if (error) throw error;
      return data as Contact[];
    },
  });

  const { data: proposals = [] } = useQuery({
    queryKey: ["company-proposals", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_proposals").select("*").eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FeeProposal[];
    },
  });

  const [form, setForm] = useState<Partial<Company> | null>(null);
  const [settleOpen, setSettleOpen] = useState(false);
  const current = form ?? company ?? null;

  const save = useMutation({
    mutationFn: async () => {
      if (!current) return;
      const c = current as Company;
      const { error } = await supabase.from("companies").update({
        nome: c.nome,
        website: c.website,
        email: c.email,
        telefone: c.telefone,
        mobile: c.mobile,
        morada: c.morada,
        postal_code: c.postal_code,
        city: c.city,
        industria: c.industria,
        status: c.status,
        notas: c.notas,
        nif: c.nif ?? null,
        code: c.code ?? null,
        abbreviation: c.abbreviation ?? null,
        currency: c.currency || "EUR",
        payment_terms: c.payment_terms ?? null,
        opening_balance_receivable: Number(c.opening_balance_receivable ?? 0),
        opening_balance_payable: Number(c.opening_balance_payable ?? 0),
        is_client: !!c.is_client,
        is_supplier: !!c.is_supplier,
        is_active: c.is_active ?? true,
        company_type: (c as Company & { company_type?: string | null }).company_type ?? null,
      }).eq("id", companyId);
      if (error) throw error;

    },
    onSuccess: () => {
      toast.success(uiI18n.t("crm:companies.updated"));
      qc.invalidateQueries({ queryKey: ["company", companyId] });
      qc.invalidateQueries({ queryKey: ["companies"] });
      setForm(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setBilling = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase
        .from("contacts")
        .update({ is_billing_contact: value } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-contacts", companyId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({

    mutationFn: async () => {
      const { error } = await supabase.from("companies").delete().eq("id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(uiI18n.t("crm:companies.deleted"));
      qc.invalidateQueries({ queryKey: ["companies"] });
      navigate({ to: back.to } as never);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !current) {
    return <div className="text-sm text-muted-foreground"> {uiI18n.t("common:loading")} </div>;
  }

  const update = <K extends keyof Company>(k: K, v: Company[K]) =>
    setForm((f) => ({ ...(f ?? company!), [k]: v }));

  return (
    <div className="space-y-4">
      <Link to={back.to as never} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> {back.label}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {current.nome}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant={relationshipVariant(relationshipOf(current as Company))}>
              {uiI18n.t(relationshipOf(current as Company) === "client" ? "glossary:relation.client" : relationshipOf(current as Company) === "supplier" ? "common:supplier" : `crm:companies.relationship.${relationshipOf(current as Company)}`)}
            </Badge>
            <Badge variant="secondary" className="capitalize">{uiI18n.t(`crm:companies.status.${current.status}`)}</Badge>
            {(current as Company).is_active === false ? (
              <Badge variant="outline"> {uiI18n.t("common:inactive")} </Badge>
            ) : null}
          </div>

        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-1" />  {uiI18n.t("common:delete")} </Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={!form || save.isPending}>
            <Save className="h-4 w-4 mr-1" />  {uiI18n.t("common:save")} </Button>
        </div>
      </div>

      <OutstandingBalanceCard company={current as Company} companyId={companyId} />

      <Tabs defaultValue="detalhes">
        <TabsList>
          <TabsTrigger value="detalhes"> {uiI18n.t("common:details")} </TabsTrigger>
          <TabsTrigger value="contactos"> {uiI18n.t("crm:companies.contactsCount", { count: contacts.length })}</TabsTrigger>
          <TabsTrigger value="propostas"> {uiI18n.t("crm:companies.proposalsCount", { count: proposals.length })}</TabsTrigger>
          <TabsTrigger value="projectos"> {uiI18n.t("crm:companies.work")} </TabsTrigger>
          <TabsTrigger value="conta-corrente"> {uiI18n.t("crm:companies.statement")} </TabsTrigger>

          <TabsTrigger value="actividades"> {uiI18n.t("common:activities")} </TabsTrigger>
        </TabsList>


        <TabsContent value="detalhes" className="space-y-4">
          {contacts[0] && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base"> {uiI18n.t("crm:common.primaryContact")} </CardTitle>
                <span className="text-xs text-muted-foreground">
                   {uiI18n.t("crm:companies.viewAllCount", { count: contacts.length })}
                </span>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2 text-sm">
                <div>
                  <div className="font-medium">{contactFullName(contacts[0])}</div>
                  <div className="text-xs text-muted-foreground">{contacts[0].posicao ?? "—"}</div>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  {contacts[0].email && <div>{contacts[0].email}</div>}
                  {(contacts[0].telemovel || contacts[0].telefone) && (
                    <div>{contacts[0].telemovel ?? contacts[0].telefone}</div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base"> {uiI18n.t("crm:companies.details")} </CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label> {uiI18n.t("common:name")} </Label>
                <Input value={current.nome ?? ""} onChange={(e) => update("nome", e.target.value)} />
              </div>
              <div>
                <Label> {uiI18n.t("common:status")} </Label>
                <Select
                  value={current.status ?? "activo"}
                  onValueChange={(v) => update("status", v as Company["status"])}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="activo"> {uiI18n.t("common:active")} </SelectItem>
                    <SelectItem value="prospecto"> {uiI18n.t("crm:companies.prospect")} </SelectItem>
                    <SelectItem value="inactivo"> {uiI18n.t("common:inactive")} </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label> {uiI18n.t("crm:companies.taxId")} </Label>
                <Input
                  value={(current as Company & { nif?: string | null }).nif ?? ""}
                  onChange={(e) => update("nif" as keyof Company, e.target.value as never)}
                />
              </div>
              <div>
                <Label> {uiI18n.t("common:type")} </Label>
                <Select
                  value={(current as Company & { company_type?: string | null }).company_type ?? "__none__"}
                  onValueChange={(v) =>
                    update("company_type" as keyof Company, (v === "__none__" ? null : v) as never)
                  }
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    <SelectItem value="cliente"> {uiI18n.t("glossary:relation.client")} </SelectItem>
                    <SelectItem value="fornecedor"> {uiI18n.t("common:supplier")} </SelectItem>
                    <SelectItem value="parceiro"> {uiI18n.t("crm:companies.partner")} </SelectItem>
                    <SelectItem value="prospecto"> {uiI18n.t("crm:companies.prospect")} </SelectItem>
                    <SelectItem value="outro"> {uiI18n.t("common:other")} </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label> {uiI18n.t("common:industry")} </Label>
                <Input value={current.industria ?? ""} onChange={(e) => update("industria", e.target.value)} />
              </div>
              <div>
                <Label> {uiI18n.t("common:website")} </Label>
                <Input value={current.website ?? ""} onChange={(e) => update("website", e.target.value)} />
              </div>
              <div>
                <Label> {uiI18n.t("common:email")} </Label>
                <Input type="email" value={current.email ?? ""} onChange={(e) => update("email", e.target.value)} />
              </div>
              <div>
                <Label> {uiI18n.t("common:phone")} </Label>
                <Input value={current.telefone ?? ""} onChange={(e) => update("telefone", e.target.value)} />
              </div>
              <div>
                <Label> {uiI18n.t("common:mobilePhone")} </Label>
                <Input value={current.mobile ?? ""} onChange={(e) => update("mobile", e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label> {uiI18n.t("common:address")} </Label>
                <Input value={current.morada ?? ""} onChange={(e) => update("morada", e.target.value)} />
              </div>
              <div>
                <Label> {uiI18n.t("common:postalCode")} </Label>
                <Input value={current.postal_code ?? ""} onChange={(e) => update("postal_code", e.target.value)} />
              </div>
              <div>
                <Label> {uiI18n.t("common:city")} </Label>
                <Input value={current.city ?? ""} onChange={(e) => update("city", e.target.value)} />
              </div>
              <div>
                <Label> {uiI18n.t("common:code")} </Label>
                <Input
                  className="font-mono"
                  value={current.code ?? ""}
                  onChange={(e) => update("code", e.target.value)}
                />
              </div>
              <div>
                <Label> {uiI18n.t("common:abbreviation")} </Label>
                <Input value={current.abbreviation ?? ""} onChange={(e) => update("abbreviation", e.target.value)} />
              </div>
              <div>
                <Label> {uiI18n.t("common:currency")} </Label>
                <Select
                  value={current.currency || "EUR"}
                  onValueChange={(v) => update("currency", v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["EUR", "USD", "GBP", "BRL", "CHF"].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label> {uiI18n.t("crm:composer.blocks.paymentTerms")} </Label>
                <Input
                  value={current.payment_terms ?? ""}
                  onChange={(e) => update("payment_terms", e.target.value)}
                  placeholder={uiI18n.t("crm:companies.paymentTermsHint")}
                />
              </div>
              <div>
                <Label> {uiI18n.t("crm:companies.openingReceivable")} </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={String(current.opening_balance_receivable ?? 0)}
                  onChange={(e) => update("opening_balance_receivable", Number(e.target.value) || 0)}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                   {uiI18n.t("crm:companies.openingBalanceHint")} </p>
              </div>
              <div>
                <Label> {uiI18n.t("crm:companies.openingPayable")} </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={String(current.opening_balance_payable ?? 0)}
                  onChange={(e) => update("opening_balance_payable", Number(e.target.value) || 0)}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                   {uiI18n.t("crm:companies.openingBalanceHint")} </p>
              </div>
              <div className="sm:col-span-2 flex flex-wrap items-center gap-6 pt-1">
                <div className="flex items-center gap-2">
                  <Switch
                    id="co-is-client"
                    checked={!!current.is_client}
                    onCheckedChange={(v) => update("is_client", v)}
                  />
                  <Label htmlFor="co-is-client" className="text-sm"> {uiI18n.t("glossary:relation.client")} </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="co-is-supplier"
                    checked={!!current.is_supplier}
                    onCheckedChange={(v) => update("is_supplier", v)}
                  />
                  <Label htmlFor="co-is-supplier" className="text-sm"> {uiI18n.t("common:supplier")} </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="co-is-active"
                    checked={current.is_active !== false}
                    onCheckedChange={(v) => update("is_active", v)}
                  />
                  <Label htmlFor="co-is-active" className="text-sm"> {uiI18n.t("common:active")} </Label>
                </div>
              </div>
              <div className="sm:col-span-2">
                <Label> {uiI18n.t("common:notes")} </Label>
                <Textarea rows={3} value={current.notas ?? ""} onChange={(e) => update("notas", e.target.value)} />
              </div>

            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contactos">
          <Card>
            <CardContent className="p-0">
              {contacts.length === 0 ? (
                <div className="flex flex-col items-center gap-2 p-6 text-sm text-muted-foreground">
                  <Users className="h-6 w-6 opacity-50" />
                   {uiI18n.t("crm:companies.noContacts")} </div>
              ) : (
                <ul className="divide-y">
                  {contacts.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {contactFullName(c)}
                          {(c as Contact & { is_billing_contact?: boolean }).is_billing_contact ? (
                            <Badge variant="default" className="gap-1">
                              <Receipt className="h-3 w-3" />  {uiI18n.t("crm:companies.billingContact")} </Badge>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {c.posicao ?? "—"} {c.email && `· ${c.email}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Switch
                            id={`billing-${c.id}`}
                            checked={!!(c as Contact & { is_billing_contact?: boolean }).is_billing_contact}
                            onCheckedChange={(v) => setBilling.mutate({ id: c.id, value: v })}
                            disabled={setBilling.isPending}
                          />
                          <Label htmlFor={`billing-${c.id}`} className="text-xs text-muted-foreground">
                             {uiI18n.t("common:billing")} </Label>
                        </div>
                        <div className="text-xs text-muted-foreground">{c.telemovel ?? c.telefone ?? ""}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="projectos">
          <CompanyProjectsTab companyId={companyId} />
        </TabsContent>


        <TabsContent value="propostas">
          <Card>
            <CardContent className="p-0">
              {proposals.length === 0 ? (
                <div className="flex flex-col items-center gap-2 p-6 text-sm text-muted-foreground">
                  <GitBranch className="h-6 w-6 opacity-50" />
                   {uiI18n.t("crm:companies.noProposals")} </div>
              ) : (
                <ul className="divide-y">
                  {proposals.map((p) => {
                    const meta = PIPELINE_STATUSES.find((s) => s.value === p.pipeline_status);
                    return (
                      <li key={p.id} className="p-3 hover:bg-muted/30">
                        <Link
                          to="/crm/quotes/$quoteId"
                          params={{ quoteId: p.id }}
                          className="flex items-center justify-between gap-3"
                        >
                          <div>
                            <div className="font-medium">{p.titulo}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full ${meta?.color ?? "bg-muted"}`} />
                              {meta ? uiI18n.t(`crm:companies.pipeline.${meta.value}`) : "—"} · {p.probabilidade}%
                            </div>
                          </div>
                          <div className="text-sm font-semibold">{formatEUR(Number(p.valor))}</div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conta-corrente" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setSettleOpen(true)}>
              <Wallet className="size-4 mr-1" />
              {statementSideOf(current as Company) === "client"
                ? uiI18n.t("crm:companies.recordReceipt")
                : uiI18n.t("crm:companies.recordPayment")}
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <StatementView
                lockedEntityType={statementSideOf(current as Company)}
                lockedEntityId={companyId}
                lockedEntityLabel={current.nome ?? ""}
                fullHistoryByDefault
              />
            </CardContent>
          </Card>
          <PaymentsReceived companyId={companyId} />

          <Dialog open={settleOpen} onOpenChange={setSettleOpen}>
            <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {(statementSideOf(current as Company) === "client"
                    ? uiI18n.t("crm:companies.receiptPrefix")
                    : uiI18n.t("crm:companies.paymentPrefix")) + (current.nome ?? "")}
                </DialogTitle>
              </DialogHeader>
              <SettlementWorkspace
                direction={
                  statementSideOf(current as Company) === "client"
                    ? "issued"
                    : "received"
                }
                lockedCounterpartyId={companyId}
              />
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="actividades">
          <Card>
            <CardContent className="p-4">
              <ActivityTimeline companyId={companyId} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** PHC's "Saldo c/c em aberto" — reuses the shared outstanding figure. */
function OutstandingBalanceCard({
  company,
  companyId,
}: {
  company: Company;
  companyId: string;
}) {
  useTranslation();
  const kind = statementSideOf(company);
  const { data } = useCounterpartyStatement({ kind, id: companyId });
  const outstanding = data?.outstanding ?? 0;
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
             {uiI18n.t("crm:companies.outstandingPrefix")} {kind === "client" ? uiI18n.t("crm:companies.receivable") : uiI18n.t("crm:companies.payable")})
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {formatEUR(outstanding)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

