CREATE TABLE public.import_identity_mappings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_system text NOT NULL,
  source_identifier text NOT NULL,
  source_name text,
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  resource_id uuid REFERENCES public.pm_resources(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX import_identity_mappings_active_unique
  ON public.import_identity_mappings (source_system, lower(source_identifier))
  WHERE active = true;

CREATE INDEX import_identity_mappings_lookup
  ON public.import_identity_mappings (source_system, lower(source_identifier));

ALTER TABLE public.import_identity_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read import_identity_mappings"
  ON public.import_identity_mappings FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins insert import_identity_mappings"
  ON public.import_identity_mappings FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update import_identity_mappings"
  ON public.import_identity_mappings FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete import_identity_mappings"
  ON public.import_identity_mappings FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_import_identity_mappings_updated_at
  BEFORE UPDATE ON public.import_identity_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();