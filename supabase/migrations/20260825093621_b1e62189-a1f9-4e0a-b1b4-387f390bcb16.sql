-- =========================================================
-- Reminders & notifications layer
-- =========================================================

CREATE TABLE public.reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  created_by uuid,
  title text NOT NULL,
  notes text,
  due_date date,
  module text,
  entity_type text,
  entity_id uuid,
  status text NOT NULL DEFAULT 'open',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reminders_status_chk CHECK (status IN ('open', 'done', 'cancelled'))
);

CREATE INDEX reminders_owner_due_idx ON public.reminders (owner_user_id, status, due_date);
CREATE UNIQUE INDEX reminders_entity_uniq
  ON public.reminders (entity_type, entity_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminders TO authenticated;
GRANT ALL ON public.reminders TO service_role;

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reminders_select_own_or_admin" ON public.reminders
  FOR SELECT TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR created_by = auth.uid()
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "reminders_insert_authenticated" ON public.reminders
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

CREATE POLICY "reminders_update_own_or_admin" ON public.reminders
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid() OR created_by = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE POLICY "reminders_delete_own_or_admin" ON public.reminders
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE TRIGGER reminders_touch_updated_at
  BEFORE UPDATE ON public.reminders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  link_path text,
  module text,
  entity_type text,
  entity_id uuid,
  reminder_id uuid REFERENCES public.reminders(id) ON DELETE CASCADE,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_idx ON public.notifications (user_id, read_at, created_at DESC);
CREATE UNIQUE INDEX notifications_dedupe_uniq
  ON public.notifications (user_id, dedupe_key);

GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications_delete_own" ON public.notifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------

CREATE TABLE public.notification_preferences (
  user_id uuid PRIMARY KEY,
  email_digest_enabled boolean NOT NULL DEFAULT true,
  digest_hour smallint NOT NULL DEFAULT 8,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_preferences_hour_chk CHECK (digest_hour BETWEEN 0 AND 23)
);

GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_prefs_select_own" ON public.notification_preferences
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "notification_prefs_insert_own" ON public.notification_preferences
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notification_prefs_update_own" ON public.notification_preferences
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER notification_preferences_touch_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- notify(): producers call this instead of inserting directly
-- =========================================================

CREATE OR REPLACE FUNCTION public.notify_user(
  _user_id uuid,
  _kind text,
  _title text,
  _body text DEFAULT NULL,
  _link_path text DEFAULT NULL,
  _module text DEFAULT NULL,
  _entity_type text DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _reminder_id uuid DEFAULT NULL,
  _dedupe_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  IF _user_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notifications (
    user_id, kind, title, body, link_path, module,
    entity_type, entity_id, reminder_id, dedupe_key
  )
  VALUES (
    _user_id, _kind, _title, _body, _link_path, _module,
    _entity_type, _entity_id, _reminder_id, _dedupe_key
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_user(uuid, text, text, text, text, text, text, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_user(uuid, text, text, text, text, text, text, uuid, uuid, text) TO authenticated, service_role;

-- =========================================================
-- CRM: next action owner + reminder sync
-- =========================================================

ALTER TABLE public.crm_opportunities
  ADD COLUMN IF NOT EXISTS next_action_owner_id uuid;

CREATE OR REPLACE FUNCTION public.crm_opportunity_sync_reminder()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
  _reminder_id uuid;
  _old_owner uuid;
BEGIN
  _owner := COALESCE(NEW.next_action_owner_id, NEW.created_by);

  -- No action text or no owner → drop any existing reminder
  IF NEW.next_action IS NULL OR btrim(NEW.next_action) = '' OR _owner IS NULL THEN
    DELETE FROM public.reminders
      WHERE entity_type = 'crm_opportunity' AND entity_id = NEW.id;
    RETURN NEW;
  END IF;

  INSERT INTO public.reminders (
    owner_user_id, created_by, title, due_date, module, entity_type, entity_id, status
  )
  VALUES (
    _owner, COALESCE(NEW.created_by, _owner), NEW.next_action, NEW.next_action_date,
    'crm', 'crm_opportunity', NEW.id, 'open'
  )
  ON CONFLICT (entity_type, entity_id) DO UPDATE
    SET owner_user_id = EXCLUDED.owner_user_id,
        title = EXCLUDED.title,
        due_date = EXCLUDED.due_date,
        status = CASE
          WHEN public.reminders.title IS DISTINCT FROM EXCLUDED.title
            OR public.reminders.due_date IS DISTINCT FROM EXCLUDED.due_date
          THEN 'open' ELSE public.reminders.status END,
        updated_at = now()
  RETURNING id INTO _reminder_id;

  -- Notify a newly assigned owner (other than the person making the change)
  _old_owner := CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.next_action_owner_id, OLD.created_by) END;
  IF _owner IS DISTINCT FROM _old_owner AND _owner IS DISTINCT FROM auth.uid() THEN
    PERFORM public.notify_user(
      _owner,
      'reminder_assigned',
      NEW.next_action,
      NEW.name,
      '/crm/opportunities/' || NEW.id::text,
      'crm',
      'crm_opportunity',
      NEW.id,
      _reminder_id,
      'assigned:' || _reminder_id::text || ':' || _owner::text
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_opportunity_sync_reminder_trg ON public.crm_opportunities;
CREATE TRIGGER crm_opportunity_sync_reminder_trg
  AFTER INSERT OR UPDATE OF next_action, next_action_date, next_action_owner_id
  ON public.crm_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.crm_opportunity_sync_reminder();

-- Backfill reminders for existing next actions
INSERT INTO public.reminders (owner_user_id, created_by, title, due_date, module, entity_type, entity_id, status)
SELECT o.created_by, o.created_by, o.next_action, o.next_action_date, 'crm', 'crm_opportunity', o.id, 'open'
FROM public.crm_opportunities o
WHERE o.created_by IS NOT NULL
  AND o.next_action IS NOT NULL
  AND btrim(o.next_action) <> ''
ON CONFLICT (entity_type, entity_id) DO NOTHING;

-- =========================================================
-- Hourly promotion of due reminders into notifications
-- =========================================================

CREATE OR REPLACE FUNCTION public.reminders_promote_due()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer := 0;
  _r record;
BEGIN
  FOR _r IN
    SELECT id, owner_user_id, title, due_date, entity_type, entity_id, module
    FROM public.reminders
    WHERE status = 'open'
      AND due_date IS NOT NULL
      AND due_date <= CURRENT_DATE
    LIMIT 500
  LOOP
    IF public.notify_user(
      _r.owner_user_id,
      CASE WHEN _r.due_date < CURRENT_DATE THEN 'reminder_overdue' ELSE 'reminder_due' END,
      _r.title,
      NULL,
      CASE WHEN _r.entity_type = 'crm_opportunity'
        THEN '/crm/opportunities/' || _r.entity_id::text ELSE NULL END,
      _r.module,
      _r.entity_type,
      _r.entity_id,
      _r.id,
      'due:' || _r.id::text || ':' || CURRENT_DATE::text
    ) IS NOT NULL THEN
      _count := _count + 1;
    END IF;
  END LOOP;

  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.reminders_promote_due() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reminders_promote_due() TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('reminders-promote-due')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reminders-promote-due');

SELECT cron.schedule(
  'reminders-promote-due',
  '5 * * * *',
  $$SELECT public.reminders_promote_due();$$
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;