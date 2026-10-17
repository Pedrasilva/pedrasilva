DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.pm_preview_week_plan(uuid,jsonb)'::regprocedure) INTO definition;
 definition:=replace(definition,'a record;','booking record;');
 definition:=replace(definition,'FOR a IN SELECT','FOR booking IN SELECT');
 definition:=replace(definition,'base:=to_jsonb(a)','base:=to_jsonb(booking)');
 definition:=replace(definition,'IF a.is_locked OR a.source=','IF booking.is_locked OR booking.source=');
 definition:=replace(definition,'::uuid=a.resource_id AND (e->>''day'')::date BETWEEN a.start_date AND a.end_date AND (a.day_part IS NULL OR a.day_part=''full'' OR a.day_part=e->>''part'')','::uuid=booking.resource_id AND (e->>''day'')::date BETWEEN booking.start_date AND booking.end_date AND (booking.day_part IS NULL OR booking.day_part=''full'' OR booking.day_part=e->>''part'')');
 definition:=replace(definition,'ELSIF a.project_status<>','ELSIF booking.project_status<>');
 definition:=replace(definition,'''resource_id'',a.resource_id,''allocation_id'',a.id,''project_id'',a.project_id','''resource_id'',booking.resource_id,''allocation_id'',booking.id,''project_id'',booking.project_id');
 definition:=replace(definition,'IF a.start_date<p.week_start','IF booking.start_date<p.week_start');
 definition:=replace(definition,'IF a.end_date>p.week_start','IF booking.end_date>p.week_start');
 definition:=replace(definition,'ELSIF a.end_date>p.week_start','ELSIF booking.end_date>p.week_start');
 definition:=replace(definition,'''id'',a.id,''resource_id'',a.resource_id','''id'',booking.id,''resource_id'',booking.resource_id');
 definition:=replace(definition,'''split'',''resource_id'',a.resource_id','''split'',''resource_id'',booking.resource_id');
 EXECUTE definition;
END $migration$;