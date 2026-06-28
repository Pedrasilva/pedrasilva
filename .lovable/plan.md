# Critical Backup Plan

Goal: never lose data again. Two independent tracks — **data backups** (database content) and **app snapshots** (source code). Both off-site on Google Drive, both logged, both restorable.

---

## Track 1 — Database backups to Google Drive

### What gets backed up
A full JSON export of every business table — quotes (`fee_proposals`, `quote_stages`, `quote_allocations`, `quote_stage_dependencies`, `quote_external_services`, `quote_stage_supplier_costs`, `quote_payment_schedule_items`, `quote_proposal_documents/_blocks`), projects (`pm_*`), HR (`collaborators`, `salary_snapshots`, `benefit_*`, `vacation_requests`, `pm_time_entries`), CRM (`crm_*`, `companies`, `contacts`, `contracts`), finance (`financial_*`, `bank_*`, `company_expenses`), and the audit log itself.

Each backup is one timestamped `.json.gz` file, plus a per-table `.csv` bundle inside the same archive for easy human inspection.

### Where it goes
A Google Drive folder you provide (link → folder ID). Structure:

```text
<your folder>/
  daily/
    2026-06-28T03-00Z_full.json.gz
    2026-06-29T03-00Z_full.json.gz
    ...
  manual/
    2026-06-28T14-12Z_manual_<user>.json.gz
  weekly/
    2026-W26_full.json.gz
```

Retention: keep all daily for 30 days, all weekly for 1 year, all manual forever.

### How it runs
- **Nightly**: `pg_cron` (03:00 UTC) calls a public TanStack server route `/api/public/hooks/run-backup` → server function exports tables via `supabaseAdmin`, gzips, uploads to Drive using the existing Google Drive connector (same pattern as `src/lib/hr/drive-sync.functions.ts`).
- **Weekly**: same job, every Sunday, written to `weekly/`.
- **On-demand**: an admin button "Criar backup agora" calls the same server function with `trigger='manual'`.

### Audit log
New table `backup_runs`: `id, started_at, finished_at, trigger (daily|weekly|manual), status (running|success|failed), drive_file_id, drive_file_name, drive_url, size_bytes, tables_count, rows_count, error, triggered_by`.

### Recovery
Admin page "Backups" with:
- List of all runs (status, size, link to Drive file, restore button).
- **Download**: opens the Drive file.
- **Inspect**: previews the JSON for a single table.
- **Restore one table**: type-to-confirm, replaces rows in that table from the snapshot (transactional). Full-DB restore intentionally NOT one-click — too dangerous; if needed I'll guide you through it.

### Where you'll find it
**Admin → Sistema → Backups** (new card on `/admin`, route `/admin/backups`).

---

## Track 2 — Weekly app source snapshot

The codebase itself is already version-controlled in Lovable, but a major incident could leave it inaccessible. Mitigation:

- A weekly GitHub Action (or cron-driven server route, whichever you prefer) packages the repo at HEAD into a zip and uploads it to `<your folder>/app-snapshots/2026-W26_app.zip`.
- Retention: 12 weekly + 12 monthly snapshots.
- Restoring is manual (download zip, push to a fresh repo) — documented in a `RESTORE.md` placed in the same Drive folder.

Recommended path: connect your GitHub (Lovable supports it) and add a `.github/workflows/weekly-snapshot.yml` that uses your Drive token. I can write it once you confirm.

---

## What I need from you before building

1. **Google Drive folder link** — paste it; I'll extract the folder ID and reuse the existing Google Drive connector (`GOOGLE_DRIVE_API_KEY` + `LOVABLE_API_KEY` are already configured in this project for the HR receipts sync).
2. **Confirm scope** — back up everything listed under "What gets backed up", or a narrower set?
3. **Confirm app snapshot mechanism** — GitHub Action (preferred, runs even if app is down) or in-app cron?

---

## Build order once you approve

1. Migration: `backup_runs` table + grants + RLS (admin-only).
2. `src/lib/backups/backup.functions.ts` — `runBackup`, `listBackups`, `restoreTable`, all admin-gated.
3. `src/routes/api/public/hooks/run-backup.ts` — cron entry point.
4. `pg_cron` schedule (daily 03:00, weekly Sun 03:00).
5. `src/routes/_app.admin.backups.tsx` — list, manual trigger, restore dialog.
6. Card on `/admin` under "Ferramentas de sistema".
7. (Track 2) GitHub Action or equivalent — after you choose.

Reply with the Drive folder link + answers to 2 and 3 and I'll start with the migration.
