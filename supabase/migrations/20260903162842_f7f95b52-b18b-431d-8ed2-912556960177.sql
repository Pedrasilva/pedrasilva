CREATE TABLE public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;
GRANT ALL ON public.product_categories TO service_role;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_categories_read" ON public.product_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "product_categories_write" ON public.product_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.library_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL,
  manufacturer text,
  designer text,
  material_spec text,
  dimensions text,
  indicative_unit_price numeric(14,2),
  currency text NOT NULL DEFAULT 'EUR',
  price_last_updated date,
  product_url text,
  primary_image_path text,
  finish_image_path text,
  notes text,
  status text NOT NULL DEFAULT 'current',
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX library_products_category_idx ON public.library_products(category_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_products TO authenticated;
GRANT ALL ON public.library_products TO service_role;
ALTER TABLE public.library_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "library_products_read" ON public.library_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "library_products_write" ON public.library_products FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.project_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  source_library_product_id uuid REFERENCES public.library_products(id) ON DELETE SET NULL,
  reference text,
  location text,
  name text NOT NULL,
  category_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL,
  manufacturer text,
  designer text,
  material_spec text,
  dimensions text,
  selected_finish text,
  quantity numeric(12,2) NOT NULL DEFAULT 1,
  unit_price numeric(14,2),
  currency text NOT NULL DEFAULT 'EUR',
  product_url text,
  primary_image_path text,
  finish_image_path text,
  notes text,
  approval_status text NOT NULL DEFAULT 'pending',
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_items_project_idx ON public.project_items(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_items TO authenticated;
GRANT ALL ON public.project_items TO service_role;
ALTER TABLE public.project_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_items_read" ON public.project_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "project_items_write" ON public.project_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.product_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL,
  owner_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'document',
  label text,
  storage_path text,
  bucket text,
  drive_file_id text,
  url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_files_owner_idx ON public.product_files(owner_type, owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_files TO authenticated;
GRANT ALL ON public.product_files TO service_role;
ALTER TABLE public.product_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_files_read" ON public.product_files FOR SELECT TO authenticated USING (true);
CREATE POLICY "product_files_write" ON public.product_files FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER product_categories_touch BEFORE UPDATE ON public.product_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER library_products_touch BEFORE UPDATE ON public.library_products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER project_items_touch BEFORE UPDATE ON public.project_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

WITH roots AS (
  INSERT INTO public.product_categories (name, sort_order)
  VALUES ('Furniture', 1), ('Lighting', 2)
  RETURNING id, name
)
INSERT INTO public.product_categories (parent_id, name, sort_order)
SELECT r.id, c.name, c.ord
FROM roots r
JOIN (VALUES
  ('Furniture','Chair',1),('Furniture','Armchair',2),('Furniture','Sofa',3),
  ('Furniture','Stool',4),('Furniture','Table',5),('Furniture','Desk',6),
  ('Furniture','Storage',7),('Furniture','Bed',8),('Furniture','Accessory',9),
  ('Furniture','Other',10),
  ('Lighting','Pendant',1),('Lighting','Ceiling',2),('Lighting','Wall',3),
  ('Lighting','Floor',4),('Lighting','Table lamp',5),('Lighting','Technical',6)
) AS c(root, name, ord) ON c.root = r.name;