ALTER TABLE public.project_items ALTER COLUMN approval_status DROP DEFAULT;
UPDATE public.project_items SET approval_status = 'proposed' WHERE approval_status NOT IN ('proposed','approved','rejected');
ALTER TABLE public.project_items ALTER COLUMN approval_status SET DEFAULT 'proposed';
ALTER TABLE public.project_items DROP CONSTRAINT IF EXISTS project_items_approval_status_check;
ALTER TABLE public.project_items ADD CONSTRAINT project_items_approval_status_check CHECK (approval_status IN ('proposed','approved','rejected'));