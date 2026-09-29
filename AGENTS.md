# Agent rules

- Marketing module: captures in marketing_captures (original fields immutable via trigger) + files in private marketing-assets bucket at {capture_id}/...; always served via signed URLs. Why: originals are evidence and assets may need client clearance.
- Marketing email intake: ideas@ read via GOOGLE_MAIL_API_KEY_3 in src/routes/api/public/hooks/marketing-intake.ts; hook secret lives only in Vault (marketing_intake_secret, checked by service-role-only marketing_intake_secret_matches). Why: no secret values in migrations or env duplicates.
