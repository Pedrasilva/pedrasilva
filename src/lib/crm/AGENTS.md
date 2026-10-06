# CRM rules

- CRM email leads: Gmail threads labelled "CRM" (luis@, GOOGLE_MAIL_API_KEY) become crm_email_lead_drafts via src/routes/api/public/hooks/crm-email-intake.ts (10-min cron, gate token in service-role-only crm_email_intake_gate); only crm_email_lead_confirm (admin) writes contacts/companies/opportunities/activities, and imported threads get "CRM/Importado". Why: nothing enters the CRM without a person confirming.
