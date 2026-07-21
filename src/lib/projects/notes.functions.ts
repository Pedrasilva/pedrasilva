import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CHAT_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const STT_URL = "https://ai.gateway.lovable.dev/v1/audio/transcriptions";
const CHAT_MODEL = "google/gemini-3.5-flash";
const STT_MODEL = "openai/gpt-4o-mini-transcribe";

const CATEGORIES = [
  "client_request",
  "todo",
  "issue_risk",
  "decision_fact",
  "project",
  "engineering",
  "status",
  "other",
] as const;
type Category = (typeof CATEGORIES)[number];

export type ClassifyResult = {
  category: Category;
  confidential: boolean;
  title: string;
  event_date: string | null;
  entities: {
    people: string[];
    stages: string[];
    materials: string[];
    dates: string[];
  };
};

// ---------------------------------------------------------------------------
// Transcribe (voice → text)
// ---------------------------------------------------------------------------

export const transcribeProjectNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        audioBase64: z.string().min(1),
        mimeType: z.string().default("audio/wav"),
        filename: z.string().default("recording.wav"),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ text: string }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const bytes = Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: data.mimeType });

    const form = new FormData();
    form.append("model", STT_MODEL);
    form.append("file", blob, data.filename);

    const res = await fetch(STT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Transcription failed [${res.status}]: ${body.slice(0, 400)}`);
    }
    const json = (await res.json()) as { text?: string };
    return { text: json.text ?? "" };
  });

// ---------------------------------------------------------------------------
// Classify a note (typed or transcribed)
// ---------------------------------------------------------------------------

const CLASSIFY_SCHEMA = {
  name: "project_note_classification",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      category: {
        type: "string",
        enum: [...CATEGORIES],
        description:
          "client_request = something requested by or to discuss with the client; todo = action item; issue_risk = defect, problem or warning; decision_fact = important decision or reference fact; project = general project note; engineering = engineering-specific note; status = status update; other = anything else.",
      },
      confidential: {
        type: "boolean",
        description:
          "True if the note explicitly says it's confidential, private, sensitive, or admin-only.",
      },
      title: { type: "string", description: "Short 3-8 word title" },
      event_date: {
        type: ["string", "null"],
        description: "ISO date the note refers to, or null if not mentioned.",
      },
      entities: {
        type: "object",
        additionalProperties: false,
        properties: {
          people: { type: "array", items: { type: "string" } },
          stages: { type: "array", items: { type: "string" } },
          materials: { type: "array", items: { type: "string" } },
          dates: { type: "array", items: { type: "string" } },
        },
        required: ["people", "stages", "materials", "dates"],
      },
    },
    required: ["category", "confidential", "title", "event_date", "entities"],
  },
} as const;

const CLASSIFY_SYSTEM = `You classify short field notes taken during architecture / engineering projects.
The note is written in English or Portuguese. Return JSON matching the schema exactly.
- Pick the single best category from the enum.
- Set confidential=true only if the note text explicitly says confidential / privado / private / sensitive.
- title: a concise 3-8 word summary in the same language as the note.
- event_date: ISO YYYY-MM-DD if the note mentions a specific date; otherwise null.
- entities.people: names mentioned. entities.materials: physical materials mentioned (roof, windows, tiles, concrete...). entities.stages: project stage names mentioned. entities.dates: any date-like phrases.`;

export const classifyProjectNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ text: z.string().min(1).max(8000) }).parse(input),
  )
  .handler(async ({ data }): Promise<ClassifyResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [
          { role: "system", content: CLASSIFY_SYSTEM },
          { role: "user", content: data.text },
        ],
        response_format: { type: "json_schema", json_schema: CLASSIFY_SCHEMA },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Classify failed [${res.status}]: ${body.slice(0, 400)}`);
    }
    const raw = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = raw.choices?.[0]?.message?.content ?? "{}";
    let parsed: ClassifyResult;
    try {
      parsed = JSON.parse(content) as ClassifyResult;
    } catch {
      throw new Error("Classifier returned invalid JSON");
    }
    // Belt-and-braces: heuristic keyword override for confidential flag.
    if (!parsed.confidential) {
      const lower = data.text.toLowerCase();
      if (
        lower.includes("confidential") ||
        lower.includes("confidencial") ||
        lower.includes("privado") ||
        lower.includes("private")
      ) {
        parsed.confidential = true;
      }
    }
    return parsed;
  });

// ---------------------------------------------------------------------------
// Ask a question over the project's note history
// ---------------------------------------------------------------------------

const ASK_SYSTEM = `You answer questions about a specific project using the note log below.
- Ground every claim in the notes; if the notes don't say, reply that you don't have that information.
- Be concise (3-6 sentences max, or a short bulleted list).
- When you cite a note, wrap the note number in square brackets like [3].
- Answer in the same language as the question.`;

export const askProjectNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        question: z.string().min(1).max(1000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ answer: string; noteIds: string[] }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
    const { supabase } = context;

    // Query notes as the caller — RLS filters confidentiality automatically.
    const { data: notes, error } = await supabase
      .from("pm_project_notes")
      .select("id, body, category, event_date, created_at, confidential, entities")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const list = (notes ?? []).map((n, i) => {
      const date = n.event_date ?? String(n.created_at).slice(0, 10);
      return `[${i + 1}] (${date}, ${n.category}) ${n.body}`;
    });
    const noteIds = (notes ?? []).map((n) => n.id);

    const corpus = list.length ? list.join("\n") : "(no notes yet)";
    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [
          { role: "system", content: ASK_SYSTEM },
          {
            role: "user",
            content: `Project notes:\n${corpus}\n\nQuestion: ${data.question}`,
          },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Ask failed [${res.status}]: ${body.slice(0, 400)}`);
    }
    const raw = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return { answer: raw.choices?.[0]?.message?.content ?? "", noteIds };
  });
