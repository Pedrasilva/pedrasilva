
## Goal

Add a **Notes** tab to every project dashboard where team members log short notes (typed or voice-dictated from phone or desktop). Lovable AI transcribes, auto-classifies, extracts entities, and later answers natural-language questions across a project's note history — building a searchable memory that survives staff turnover.

## Data model

New table `pm_project_notes`:
- `project_id` → `pm_projects` (cascade)
- `author_id` → `auth.users` (the person logging the note)
- `body` (final text — transcribed or typed)
- `raw_transcript` (original STT output, kept for audit)
- `category` — enum: `client_request`, `todo`, `issue_risk`, `decision_fact`, `project`, `engineering`, `status`, `other`
- `confidential` (bool) — set true when the note mentions "confidential" or the toggle is on
- `entities` (jsonb) — `{ people:[], stages:[], materials:[], dates:[] }` extracted by the model
- `stage_id` (nullable) — set when a stage is mentioned/selected
- `event_date` (nullable date) — the date the note refers to, not just created_at
- `source` — `voice` | `typed`
- `audio_url` (nullable) — original recording in Storage for replay
- standard `created_at` / `updated_at`

Storage bucket `project-note-audio` (private) for raw recordings.

**RLS** (matches locked visibility rule):
- Read: any authenticated user on non-confidential notes; confidential notes only visible to admins and the project lead (`pm_projects.lead_id` or equivalent) and the note's author.
- Insert: any authenticated user, `author_id = auth.uid()`.
- Update/Delete: author or admin only.

Grants: `authenticated` (SELECT/INSERT/UPDATE/DELETE), `service_role` (ALL). No `anon`.

## Server functions (`src/lib/projects/notes.functions.ts`)

All under `requireSupabaseAuth`:

1. `transcribeNote({ audio })` — forwards the uploaded audio to Lovable AI `openai/gpt-4o-mini-transcribe`; returns text.
2. `classifyNote({ text, projectContext })` — calls `google/gemini-3.5-flash` with a small schema:
   ```
   { category, confidential, event_date?, stage_hint?, entities:{people,materials,dates,stages}, title }
   ```
   Prompt states: "If the author says the note is confidential, set confidential=true." Categories constrained to the enum above.
3. `createNote({ projectId, body, rawTranscript?, audioPath?, source, aiMetadata })` — persists the row using the classifier's output; caller can override category before save.
4. `askProjectNotes({ projectId, question })` — retrieves the project's notes (respecting RLS via the user's client), passes them as context to Gemini, returns an answer with citations back to note IDs. No embeddings in v1 — small note volumes per project make plain context injection sufficient.

## UI (new `src/components/projects/notes/`)

New **Notes** tab in `_app.projects.$projectId.tsx` (added to the existing tab set beside Overview / Retainer / Approvals / Insights).

**Composer card** at the top:
- Big text area with a mic button.
- Mic uses `MediaRecorder` → WAV via Web Audio (per `ai-speech-to-text` guidance) → uploads to backend → `transcribeNote` → fills the text area. Works on desktop and mobile browsers (same URL — the "phone as web app" path covers the primary use case).
- On submit: calls `classifyNote`, shows an inline chip row with the AI's suggested category, confidential flag, stage, event date, and detected entities. User can adjust before saving.
- Manual "Mark confidential" toggle in addition to keyword detection.

**Timeline** below:
- Reverse-chronological list grouped by month.
- Each note shows: author avatar + name, category badge (color-coded), confidential lock icon when applicable, event date if different from created_at, body, entity chips, ▶ button when `audio_url` present.
- Filters: category, author, stage, date range, confidential-only (admin/lead), free-text search.

**Ask panel** (right side or collapsible drawer):
- Chat input: "Ask about this project's history".
- Streams answer from `askProjectNotes`, renders markdown, and each cited note is a clickable link scrolling the timeline to that entry.

**Global surface** (light-touch, admin-only for now):
- Add "Recent project notes" widget to the existing home feed so leadership sees new confidential/high-priority notes as they land. Same RLS applies automatically.

## Voice-input scope (per user answer)

Phase 1 ships the web-app path only: open the project on your phone, tap mic, dictate. No pairing. Phone-to-desktop pairing is deferred; the timeline and Ask panel work identically once notes exist regardless of source.

## i18n

Two new namespaces `projects.notes.*` in EN and PT-PT (parity checked by existing workflow). All category labels reused from `glossary.crm.*` where they exist; new ones (`todo`, `issueRisk`, `decisionFact`, `engineering`, `status`) added to `glossary` per the memory rule so future modules reuse them.

## Out of scope for v1

- Embedding-based semantic search (add later if note volume per project grows past a few hundred).
- Editing notes after creation beyond category/confidential toggles by the author.
- Cross-project search.
- Push notifications.

## Technical notes

- Audio path uses WAV upload (avoids Safari MP4/webm mismatch) as documented in `ai-speech-to-text`.
- All AI calls happen server-side via `createServerFn`, never from the browser; `LOVABLE_API_KEY` stays server-only.
- Model choice: `openai/gpt-4o-mini-transcribe` for STT (cost-efficient), `google/gemini-3.5-flash` for classification and Q&A (fast, cheap, large context — one project's full note history fits easily).
- Follow existing `_authenticated` route conventions; no new top-level route needed — the tab lives inside the current project page.

