// Timesheet assistant voice → text, with a vocabulary hint (names the person
// is likely to say). No language is forced: people mix PT and EN.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STT_URL = "https://ai.gateway.lovable.dev/v1/audio/transcriptions";
/** Switch to "openai/gpt-4o-transcribe" for higher accuracy (more expensive). */
export const TIMESHEET_STT_MODEL: "openai/gpt-4o-mini-transcribe" | "openai/gpt-4o-transcribe" =
  "openai/gpt-4o-mini-transcribe";
const HINT_MAX = 800;
const FIXED_TERMS = ["angariação", "Pursuit", "propostas de honorários", "fee proposals", "reunião", "meetings", "avença"];

/** Build the hint for one user: most-used projects first, then clients, leads, colleagues, categories. */
export async function buildTimesheetVocabularyHint(db: any, userId: string): Promise<string> {
  const since = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  const [entriesRes, projRes, leadRes, peopleRes, catRes] = await Promise.all([
    db.from("pm_time_entries").select("hours, pm_stage_id, internal_category, opportunity_id").eq("user_id", userId).gte("entry_date", since).limit(3000),
    db.from("pm_projects").select("id, name, client, stages:pm_stages(id)").eq("status", "active").limit(400),
    db.rpc("crm_leads_directory"),
    db.from("collaborators_directory").select("nome").is("archived_at", null),
    db.from("pm_internal_categories").select("name").is("archived_at", null).order("sort_order"),
  ]);
  const projects = (projRes.data ?? []) as Array<{ id: string; name: string; client: string | null; stages: { id: string }[] | null }>;
  const stageToProject = new Map<string, string>();
  for (const p of projects) for (const s of p.stages ?? []) stageToProject.set(s.id, p.id);
  const used = new Map<string, number>();
  for (const e of (entriesRes.data ?? []) as Array<{ hours: number; pm_stage_id: string | null }>) {
    const pid = e.pm_stage_id ? stageToProject.get(e.pm_stage_id) : undefined;
    if (pid) used.set(pid, (used.get(pid) ?? 0) + Number(e.hours || 0));
  }
  const ranked = [...projects].sort((a, b) => (used.get(b.id) ?? 0) - (used.get(a.id) ?? 0) || a.name.localeCompare(b.name));

  const terms: string[] = [];
  const seen = new Set<string>();
  const add = (s: string | null | undefined) => {
    const v = (s ?? "").replace(/\s+/g, " ").trim();
    if (!v || seen.has(v.toLowerCase())) return;
    seen.add(v.toLowerCase());
    terms.push(v);
  };
  // Used projects (with client) first, then the rest, interleaved with the other lists by priority.
  for (const p of ranked.filter((p) => used.has(p.id))) { add(p.name); add(p.client); }
  for (const l of ((leadRes.data ?? []) as Array<{ name: string; company_name: string; is_open: boolean }>).filter((l) => l.is_open)) { add(l.name); add(l.company_name); }
  for (const c of (catRes.data ?? []) as Array<{ name: string }>) add(c.name);
  for (const f of FIXED_TERMS) add(f);
  for (const p of (peopleRes.data ?? []) as Array<{ nome: string | null }>) add((p.nome ?? "").split(" ")[0]);
  for (const p of ranked.filter((p) => !used.has(p.id))) { add(p.name); add(p.client); }

  let out = "";
  for (const t of terms) {
    const next = out ? `${out}, ${t}` : t;
    if (next.length > HINT_MAX) break;
    out = next;
  }
  return out;
}

export const transcribeTimesheetDictation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ audioBase64: z.string().min(1), mimeType: z.string().default("audio/wav"), filename: z.string().default("hours.wav") }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ text: string }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
    const bytes = Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0));
    let hint = "";
    try { hint = await buildTimesheetVocabularyHint(context.supabase, context.userId); } catch { hint = ""; }
    const call = (withHint: boolean) => {
      const form = new FormData();
      form.append("model", TIMESHEET_STT_MODEL);
      if (withHint && hint) form.append("prompt", hint);
      form.append("file", new Blob([bytes as BlobPart], { type: data.mimeType }), data.filename);
      return fetch(STT_URL, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form });
    };
    let res = await call(true);
    if (!res.ok && hint && res.status === 400) res = await call(false);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Transcription failed [${res.status}]: ${body.slice(0, 400)}`);
    }
    const json = (await res.json()) as { text?: string };
    return { text: json.text ?? "" };
  });
