-- ============ ENUMS ============
CREATE TYPE public.inventory_tracking_level AS ENUM ('major', 'standard', 'accessory');
CREATE TYPE public.inventory_asset_status AS ENUM ('available', 'in_use', 'spare', 'repair', 'retired', 'lost', 'disposed');
CREATE TYPE public.inventory_custody_mode AS ENUM ('person', 'shared', 'location');
CREATE TYPE public.inventory_event_type AS ENUM ('purchased', 'created', 'assigned', 'returned', 'reassigned', 'status_change', 'repair', 'retired', 'disposed', 'updated', 'note');
CREATE TYPE public.inventory_workflow_status AS ENUM ('pending', 'partially_processed', 'complete');

-- ============ CATEGORIES ============
CREATE TABLE public.inventory_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  default_depreciation_years integer NOT NULL DEFAULT 4,
  default_replacement_years integer NOT NULL DEFAULT 5,
  default_tracking_level public.inventory_tracking_level NOT NULL DEFAULT 'standard',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_categories TO authenticated;
GRANT ALL ON public.inventory_categories TO service_role;
ALTER TABLE public.inventory_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv_categories_read" ON public.inventory_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "inv_categories_write" ON public.inventory_categories FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "inv_categories_update" ON public.inventory_categories FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "inv_categories_delete" ON public.inventory_categories FOR DELETE TO authenticated USING (public.is_super_admin(auth.uid()));

INSERT INTO public.inventory_categories (code, name, default_depreciation_years, default_replacement_years, default_tracking_level, sort_order) VALUES
 ('LAP','Laptop / computer',4,5,'major',10),
 ('MON','Monitor',5,6,'standard',20),
 ('KBD','Keyboard',4,4,'standard',30),
 ('MSE','Mouse',3,3,'standard',40),
 ('PWR','Charger / power adapter',4,4,'standard',50),
 ('DOC','Dock / docking station',4,4,'standard',60),
 ('PHN','Phone',4,4,'standard',70),
 ('TAB','Tablet',4,4,'standard',80),
 ('CAM','Camera',5,6,'major',90),
 ('LNS','Camera lens',7,8,'major',100),
 ('TRP','Tripod',7,8,'standard',110),
 ('FLS','Flash / photo accessory',5,6,'standard',120),
 ('PRN','Printer',5,6,'major',130),
 ('NAS','NAS / server',5,5,'major',140),
 ('NET','Network equipment',5,5,'standard',150),
 ('FUR','Furniture',8,10,'standard',160),
 ('OTH','Other',4,5,'standard',999);

-- ============ CODE COUNTERS ============
CREATE TABLE public.inventory_code_counters (
  category_code text PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.inventory_code_counters TO authenticated;
GRANT ALL ON public.inventory_code_counters TO service_role;
ALTER TABLE public.inventory_code_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv_counters_read" ON public.inventory_code_counters FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.allocate_inventory_code(_category_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _n integer;
BEGIN
  IF _category_code IS NULL OR length(trim(_category_code)) = 0 THEN
    RAISE EXCEPTION 'Category code is required';
  END IF;
  INSERT INTO public.inventory_code_counters (category_code, last_number)
  VALUES (upper(_category_code), 1)
  ON CONFLICT (category_code) DO UPDATE SET last_number = public.inventory_code_counters.last_number + 1
  RETURNING last_number INTO _n;
  RETURN 'PSA-' || upper(_category_code) || '-' || lpad(_n::text, 3, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION public.allocate_inventory_code(text) TO authenticated, service_role;

-- ============ KITS ============
CREATE TABLE public.inventory_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_kits TO authenticated;
GRANT ALL ON public.inventory_kits TO service_role;
ALTER TABLE public.inventory_kits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv_kits_read" ON public.inventory_kits FOR SELECT TO authenticated USING (true);
CREATE POLICY "inv_kits_write" ON public.inventory_kits FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ ASSETS ============
CREATE TABLE public.inventory_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code text NOT NULL UNIQUE,
  name text NOT NULL,
  category_id uuid NOT NULL REFERENCES public.inventory_categories(id),
  tracking_level public.inventory_tracking_level NOT NULL DEFAULT 'standard',
  brand text,
  model text,
  serial_number text,
  description text,
  photo_path text,
  status public.inventory_asset_status NOT NULL DEFAULT 'available',
  custody_mode public.inventory_custody_mode NOT NULL DEFAULT 'shared',
  assigned_collaborator_id uuid REFERENCES public.collaborators(id) ON DELETE SET NULL,
  location text,
  department text,
  supplier_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  purchase_date date,
  purchase_price_ex_vat numeric(14,2),
  vat_amount numeric(14,2),
  purchase_price_inc_vat numeric(14,2),
  invoice_number_snapshot text,
  source_document_id uuid REFERENCES public.financial_documents(id) ON DELETE SET NULL,
  source_document_line_id uuid REFERENCES public.financial_document_lines(id) ON DELETE SET NULL,
  source_unit_index integer,
  warranty_expiry date,
  depreciation_years integer NOT NULL DEFAULT 4,
  replacement_years integer NOT NULL DEFAULT 5,
  insurance_value numeric(14,2),
  include_in_insurance_register boolean NOT NULL DEFAULT false,
  kit_id uuid REFERENCES public.inventory_kits(id) ON DELETE SET NULL,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Hard duplicate protection: one asset per (invoice line, unit index)
CREATE UNIQUE INDEX inventory_assets_source_unit_uniq
  ON public.inventory_assets (source_document_line_id, source_unit_index)
  WHERE source_document_line_id IS NOT NULL AND source_unit_index IS NOT NULL;
CREATE INDEX inventory_assets_source_doc_idx ON public.inventory_assets (source_document_id);
CREATE INDEX inventory_assets_collab_idx ON public.inventory_assets (assigned_collaborator_id);
CREATE INDEX inventory_assets_category_idx ON public.inventory_assets (category_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_assets TO authenticated;
GRANT ALL ON public.inventory_assets TO service_role;
ALTER TABLE public.inventory_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv_assets_read" ON public.inventory_assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "inv_assets_insert" ON public.inventory_assets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "inv_assets_update" ON public.inventory_assets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "inv_assets_delete" ON public.inventory_assets FOR DELETE TO authenticated USING (public.is_super_admin(auth.uid()));

-- asset_code is immutable
CREATE OR REPLACE FUNCTION public.inventory_assets_guard_code()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.asset_code IS DISTINCT FROM OLD.asset_code THEN
    RAISE EXCEPTION 'Asset code is permanent and cannot be changed';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER inventory_assets_guard_code_trg
BEFORE UPDATE ON public.inventory_assets
FOR EACH ROW EXECUTE FUNCTION public.inventory_assets_guard_code();

-- ============ ASSIGNMENTS (canonical custody history) ============
CREATE TABLE public.inventory_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.inventory_assets(id) ON DELETE CASCADE,
  custody_mode public.inventory_custody_mode NOT NULL,
  collaborator_id uuid REFERENCES public.collaborators(id) ON DELETE SET NULL,
  location text,
  department text,
  assigned_on date NOT NULL DEFAULT current_date,
  returned_on date,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_assignments_asset_idx ON public.inventory_assignments (asset_id, assigned_on DESC);
CREATE INDEX inventory_assignments_collab_idx ON public.inventory_assignments (collaborator_id) WHERE returned_on IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_assignments TO authenticated;
GRANT ALL ON public.inventory_assignments TO service_role;
ALTER TABLE public.inventory_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv_assign_read" ON public.inventory_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "inv_assign_write" ON public.inventory_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ EVENT HISTORY ============
CREATE TABLE public.inventory_asset_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.inventory_assets(id) ON DELETE CASCADE,
  event_type public.inventory_event_type NOT NULL,
  event_date date NOT NULL DEFAULT current_date,
  field text,
  previous_value text,
  new_value text,
  notes text,
  actor_user_id uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_asset_events_asset_idx ON public.inventory_asset_events (asset_id, created_at DESC);
GRANT SELECT, INSERT ON public.inventory_asset_events TO authenticated;
GRANT ALL ON public.inventory_asset_events TO service_role;
ALTER TABLE public.inventory_asset_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv_events_read" ON public.inventory_asset_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "inv_events_insert" ON public.inventory_asset_events FOR INSERT TO authenticated WITH CHECK (true);

-- Sync current custody on the asset from the assignment history + log events
CREATE OR REPLACE FUNCTION public.inventory_sync_custody()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _current record;
BEGIN
  -- close any other open assignment for this asset when a new one opens
  IF TG_OP = 'INSERT' AND NEW.returned_on IS NULL THEN
    UPDATE public.inventory_assignments
       SET returned_on = COALESCE(NEW.assigned_on, current_date), updated_at = now()
     WHERE asset_id = NEW.asset_id AND id <> NEW.id AND returned_on IS NULL;
  END IF;

  SELECT * INTO _current
    FROM public.inventory_assignments
   WHERE asset_id = NEW.asset_id AND returned_on IS NULL
   ORDER BY assigned_on DESC, created_at DESC
   LIMIT 1;

  IF _current.id IS NOT NULL THEN
    UPDATE public.inventory_assets
       SET custody_mode = _current.custody_mode,
           assigned_collaborator_id = _current.collaborator_id,
           location = COALESCE(_current.location, location),
           department = COALESCE(_current.department, department),
           status = CASE WHEN status IN ('available','spare') THEN 'in_use'::public.inventory_asset_status ELSE status END,
           updated_at = now()
     WHERE id = NEW.asset_id;
  ELSE
    UPDATE public.inventory_assets
       SET assigned_collaborator_id = NULL,
           custody_mode = 'shared',
           status = CASE WHEN status = 'in_use' THEN 'available'::public.inventory_asset_status ELSE status END,
           updated_at = now()
     WHERE id = NEW.asset_id;
  END IF;

  INSERT INTO public.inventory_asset_events (asset_id, event_type, event_date, field, new_value, notes)
  VALUES (
    NEW.asset_id,
    CASE WHEN NEW.returned_on IS NOT NULL THEN 'returned'::public.inventory_event_type
         WHEN TG_OP = 'INSERT' THEN 'assigned'::public.inventory_event_type
         ELSE 'updated'::public.inventory_event_type END,
    COALESCE(NEW.returned_on, NEW.assigned_on, current_date),
    'custody',
    COALESCE(NEW.collaborator_id::text, NEW.location, NEW.custody_mode::text),
    NEW.notes
  );

  RETURN NEW;
END;
$$;
CREATE TRIGGER inventory_assignments_sync_trg
AFTER INSERT OR UPDATE ON public.inventory_assignments
FOR EACH ROW EXECUTE FUNCTION public.inventory_sync_custody();

-- Log status changes on the asset itself
CREATE OR REPLACE FUNCTION public.inventory_assets_log_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.inventory_asset_events (asset_id, event_type, event_date, field, new_value)
    VALUES (NEW.id, CASE WHEN NEW.source_document_id IS NOT NULL THEN 'purchased'::public.inventory_event_type ELSE 'created'::public.inventory_event_type END,
            COALESCE(NEW.purchase_date, current_date), 'status', NEW.status::text);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.inventory_asset_events (asset_id, event_type, field, previous_value, new_value)
    VALUES (NEW.id, 'status_change', 'status', OLD.status::text, NEW.status::text);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER inventory_assets_log_status_trg
AFTER INSERT OR UPDATE ON public.inventory_assets
FOR EACH ROW EXECUTE FUNCTION public.inventory_assets_log_status();

-- ============ ASSET DOCUMENTS ============
CREATE TABLE public.inventory_asset_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.inventory_assets(id) ON DELETE CASCADE,
  doc_kind text NOT NULL DEFAULT 'other',
  title text,
  financial_document_id uuid REFERENCES public.financial_documents(id) ON DELETE SET NULL,
  storage_bucket text,
  storage_path text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_asset_documents_target_chk
    CHECK (financial_document_id IS NOT NULL OR storage_path IS NOT NULL)
);
CREATE INDEX inventory_asset_documents_asset_idx ON public.inventory_asset_documents (asset_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_asset_documents TO authenticated;
GRANT ALL ON public.inventory_asset_documents TO service_role;
ALTER TABLE public.inventory_asset_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv_docs_read" ON public.inventory_asset_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "inv_docs_write" ON public.inventory_asset_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ FINANCE WORKFLOW MARKER (single controlled status) ============
ALTER TABLE public.financial_documents
  ADD COLUMN IF NOT EXISTS inventory_status public.inventory_workflow_status;

-- ============ DERIVED PROCESSING VIEW ============
CREATE OR REPLACE VIEW public.inventory_line_processing AS
SELECT
  l.id AS line_id,
  l.document_id,
  COALESCE(l.quantity, 1)::numeric AS quantity_total,
  COUNT(a.id)::integer AS quantity_processed,
  GREATEST(COALESCE(l.quantity, 1)::numeric - COUNT(a.id), 0) AS quantity_remaining,
  COALESCE(MAX(a.source_unit_index), 0) AS max_unit_index
FROM public.financial_document_lines l
LEFT JOIN public.inventory_assets a ON a.source_document_line_id = l.id
GROUP BY l.id, l.document_id, l.quantity;

GRANT SELECT ON public.inventory_line_processing TO authenticated, service_role;

-- updated_at triggers
CREATE TRIGGER inventory_categories_touch BEFORE UPDATE ON public.inventory_categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER inventory_kits_touch BEFORE UPDATE ON public.inventory_kits
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER inventory_assignments_touch BEFORE UPDATE ON public.inventory_assignments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();