# CRM rules

- CRM email leads: Gmail threads labelled "CRM" (luis@, GOOGLE_MAIL_API_KEY) become crm_email_lead_drafts via src/routes/api/public/hooks/crm-email-intake.ts (hourly cron on the hour; past email dates kept in mentioned_date and replaced by +2 working days, gate token in service-role-only crm_email_intake_gate); only crm_email_lead_confirm (admin) writes contacts/companies/opportunities/activities, and imported threads get "CRM/Importado". Why: nothing enters the CRM without a person confirming.
