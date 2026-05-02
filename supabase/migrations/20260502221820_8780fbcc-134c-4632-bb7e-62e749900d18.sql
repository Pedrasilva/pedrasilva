
DELETE FROM public.historical_time_entries;
DELETE FROM public.import_jobs WHERE import_type = 'accelo_activity_timesheet';
DELETE FROM public.pm_projects;
