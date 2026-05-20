/**
 * Proposal Assembly Panel — V1.
 *
 * Additive UI: opens from the proposal tab, lets the user toggle appendices
 * and flags, then inserts the assembled containers as editable blocks via
 * `useAssembleProposalInsert`. Existing blocks are preserved (append-only).
 *
 * V1 hard-codes family/preset/delivery-mode to workplace/large_corporate_fitout/psa_led;
 * the controls are visible but disabled, signalling future scope.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { useQuoteStages } from "@/lib/quotes/use-quote-stages";
import { useQuotePaymentSchedule } from "@/lib/quotes/use-quote-payment-schedule";
import {
  assembleProposal,
  useAssembleProposalInsert,
  type AssemblyAppendixToggles,
  type AssemblyFlags,
  type AssemblyInput,
  type ProposalDeliveryMode,
  type ProposalFamily,
  type ProposalPreset,
} from "@/lib/proposal-assembly";
import type { Locale } from "@/lib/proposal-rendering";

interface Props {
  quoteId: string;
  documentId: string | undefined;
  quoteCode?: string | null;
  quoteTitle?: string | null;
  clientName?: string | null;
  hasExistingBlocks?: boolean;
}

export function ProposalAssemblyPanel(props: Props) {
  const { t, i18n } = useTranslation(["crm"]);
  const [open, setOpen] = useState(false);
  const [family] = useState<ProposalFamily>("workplace");
  const [preset] = useState<ProposalPreset>("large_corporate_fitout");
  const [deliveryMode] = useState<ProposalDeliveryMode>("psa_led");
  const [language, setLanguage] = useState<Locale>(
    (i18n.language as Locale) === "en" ? "en" : "pt-PT",
  );

  const [appendices, setAppendices] = useState<AssemblyAppendixToggles>({
    I: true,
    II: true,
    III: true,
    IV: true,
    V: true,
    VI: true,
  });
  const [flags, setFlags] = useState<AssemblyFlags>({
    showHours: true,
    showDurations: true,
    showConsultantTrack: false,
  });

  const { data: stages = [] } = useQuoteStages(props.quoteId);
  const { data: schedule = [] } = useQuotePaymentSchedule(props.quoteId);
  const insert = useAssembleProposalInsert(props.documentId);

  const input: AssemblyInput = useMemo(
    () => ({
      family,
      preset,
      deliveryMode,
      language,
      flags,
      addOns: [],
      appendices,
      assemblyKey: `${props.quoteId}:${language}:v1`,
      data: {
        quote: {
          id: props.quoteId,
          code: props.quoteCode ?? null,
          title: props.quoteTitle ?? null,
          project_name: props.quoteTitle ?? null,
          client_name: props.clientName ?? null,
          currency: "EUR",
          proposal_date: new Date().toISOString().slice(0, 10),
          proposal_version: "v1",
        },
        stages: (stages as Array<Record<string, unknown>>).map((s) => ({
          code: String(s.code ?? s.stage_code ?? s.id ?? ""),
          name: String(s.name ?? s.title ?? ""),
          duration_days:
            typeof s.duration_days === "number"
              ? (s.duration_days as number)
              : null,
          estimated_hours:
            typeof s.estimated_hours === "number"
              ? (s.estimated_hours as number)
              : null,
          fee: typeof s.fee === "number" ? (s.fee as number) : null,
        })),
        paymentSchedule: (schedule as Array<Record<string, unknown>>).map(
          (p) => ({
            label: String(p.label ?? p.name ?? ""),
            trigger: String(p.trigger ?? p.payment_trigger ?? ""),
            amount: typeof p.amount === "number" ? (p.amount as number) : 0,
          }),
        ),
        feeBreakdown: null,
        exclusions: [],
      },
    }),
    [
      family,
      preset,
      deliveryMode,
      language,
      flags,
      appendices,
      props.quoteId,
      props.quoteCode,
      props.quoteTitle,
      props.clientName,
      stages,
      schedule,
    ],
  );

  const preview = useMemo(() => assembleProposal(input), [input]);

  const handleInsert = async () => {
    try {
      if (!props.documentId) throw new Error("documentId is required");
      if (preview.containers.length === 0) {
        throw new Error("Assembly planner returned no containers");
      }
      const res = await insert.mutateAsync({
        assembled: preview,
        documentId: props.documentId,
      });
      toast.success(
        t("crm:proposalAssembly.inserted", { count: res?.inserted ?? 0 }),
      );
      if (preview.unresolvedPlaceholders.length > 0) {
        toast.warning(
          t("crm:proposalAssembly.unresolved", {
            count: preview.unresolvedPlaceholders.length,
            list: preview.unresolvedPlaceholders.join(", "),
          }),
        );
      }
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const appendixIds: Array<keyof AssemblyAppendixToggles> = ["I", "II", "III", "IV", "V", "VI"];
  const flagIds: Array<keyof AssemblyFlags> = ["showHours", "showDurations", "showConsultantTrack"];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" disabled={!props.documentId}>
          <Sparkles className="mr-2 h-4 w-4" />
          {t("crm:proposalAssembly.open")}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("crm:proposalAssembly.title")}</SheetTitle>
          <SheetDescription>
            {t("crm:proposalAssembly.subtitle")}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">{t("crm:proposalAssembly.presetLocked")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">{t("crm:proposalAssembly.family")}</Label>
                  <Select value={family} disabled>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="workplace">workplace</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{t("crm:proposalAssembly.preset")}</Label>
                  <Select value={preset} disabled>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="large_corporate_fitout">large_corporate_fitout</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{t("crm:proposalAssembly.deliveryMode")}</Label>
                  <Select value={deliveryMode} disabled>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="psa_led">psa_led</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{t("crm:proposalAssembly.language")}</Label>
                  <Select
                    value={language}
                    onValueChange={(v) => setLanguage(v as Locale)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pt-PT">pt-PT</SelectItem>
                      <SelectItem value="en">en</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <div>
            <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
              {t("crm:proposalAssembly.appendices")}
            </Label>
            <div className="space-y-2">
              {appendixIds.map((id) => (
                <label key={id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={appendices[id]}
                    onCheckedChange={(v) =>
                      setAppendices((prev) => ({ ...prev, [id]: !!v }))
                    }
                  />
                  {t(`crm:proposalAssembly.appendix.${id}`)}
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
              {t("crm:proposalAssembly.flags")}
            </Label>
            <div className="space-y-2">
              {flagIds.map((id) => (
                <label key={id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={flags[id]}
                    onCheckedChange={(v) =>
                      setFlags((prev) => ({ ...prev, [id]: !!v }))
                    }
                  />
                  {t(`crm:proposalAssembly.flag.${id}`)}
                </label>
              ))}
            </div>
          </div>

          {props.hasExistingBlocks ? (
            <p className="text-xs text-muted-foreground">
              {t("crm:proposalAssembly.warning.existingBlocks")}
            </p>
          ) : null}

          {preview.unresolvedPlaceholders.length > 0 ? (
            <p className="text-xs text-amber-600">
              {t("crm:proposalAssembly.unresolved", {
                count: preview.unresolvedPlaceholders.length,
                list: preview.unresolvedPlaceholders.join(", "),
              })}
            </p>
          ) : null}

          <Button
            className="w-full"
            onClick={handleInsert}
            disabled={!props.documentId || insert.isPending}
          >
            {t("crm:proposalAssembly.insert")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
