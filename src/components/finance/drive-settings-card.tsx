import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from '@/lib/toast';
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getDriveSettings, saveDriveSettings, testDriveAccess } from "@/lib/finance/drive-config.functions";
import type { AccessStep } from "@/lib/finance/drive-config.server";

const FIELDS = ["shared_drive_id", "intake_folder_id", "processed_folder_id", "failed_folder_id", "contabilidade_root_id"] as const;
type Form = Record<(typeof FIELDS)[number], string>;

export function DriveSettingsCard() {
  const { t } = useTranslation("finance");
  const k = (x: string, o?: Record<string, unknown>) => t(`finance:driveSettings.${x}`, o);
  const qc = useQueryClient();
  const load = useServerFn(getDriveSettings);
  const save = useServerFn(saveDriveSettings);
  const test = useServerFn(testDriveAccess);
  const q = useQuery({ queryKey: ["finance", "drive-settings"], queryFn: () => load() });
  const [form, setForm] = useState<Form>(() => Object.fromEntries(FIELDS.map((f) => [f, ""])) as Form);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [steps, setSteps] = useState<AccessStep[] | null>(null);

  useEffect(() => {
    if (!q.data) return;
    setForm(Object.fromEntries(FIELDS.map((f) => [f, (q.data as unknown as Record<string, string | null>)[f] ?? ""])) as Form);
    setSteps((q.data.last_test as unknown as AccessStep[] | null) ?? null);
  }, [q.data]);

  const onSave = async () => {
    setBusy("save");
    try { await save({ data: form }); toast.success(k("saved")); await qc.invalidateQueries({ queryKey: ["finance", "drive-settings"] }); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const onTest = async () => {
    setBusy("test");
    try {
      const r = await test();
      setSteps(r.steps);
      toast[r.ok ? "success" : "error"](r.ok ? k("testOk") : k("testFailed"));
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  return (
    <Card>
      <CardHeader className="py-3"><CardTitle className="text-sm">{k("title")}</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">{k("hint")}</p>
        <div className="grid gap-3 md:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f} className="space-y-1">
              <Label htmlFor={f}>{k(`fields.${f}`)}</Label>
              <Input id={f} value={form[f]} placeholder={k("placeholder")} onChange={(e) => setForm({ ...form, [f]: e.target.value })} />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={!!busy} onClick={() => void onSave()}>{busy === "save" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{k("save")}</Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void onTest()}>{busy === "test" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{k("test")}</Button>
        </div>
        {steps && (
          <ul className="space-y-1">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                {s.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" /> : <XCircle className="mt-0.5 h-4 w-4 text-destructive" />}
                <span className="font-medium">{k(`steps.${s.step.split(":")[0]}`)}{s.step.includes(":") ? ` (${k(`fields.${s.step.split(":")[1]}Short`)})` : ""}</span>
                <span className="break-all text-muted-foreground">{s.detail} · {s.ms} ms</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
