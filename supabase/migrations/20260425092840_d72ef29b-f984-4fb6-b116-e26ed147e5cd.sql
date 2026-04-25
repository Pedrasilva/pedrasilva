-- ============================================================
-- Enums
-- ============================================================
CREATE TYPE public.proposal_block_type AS ENUM (
  'editable_text',
  'generated_section',
  'legal_reference'
);

CREATE TYPE public.proposal_block_visibility AS ENUM (
  'client',
  'internal',
  'both'
);

CREATE TYPE public.quote_proposal_document_status AS ENUM (
  'draft',
  'ready',
  'sent',
  'accepted',
  'archived'
);

-- ============================================================
-- 1. proposal_block_categories (master library)
-- ============================================================
CREATE TABLE public.proposal_block_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_proposal_block_categories_sort
  ON public.proposal_block_categories (sort_order);

ALTER TABLE public.proposal_block_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read proposal_block_categories"
  ON public.proposal_block_categories FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins insert proposal_block_categories"
  ON public.proposal_block_categories FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update proposal_block_categories"
  ON public.proposal_block_categories FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete proposal_block_categories"
  ON public.proposal_block_categories FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_proposal_block_categories_updated_at
  BEFORE UPDATE ON public.proposal_block_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2. proposal_blocks (master library)
-- ============================================================
CREATE TABLE public.proposal_blocks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id uuid REFERENCES public.proposal_block_categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  slug text NOT NULL,
  language text NOT NULL DEFAULT 'pt-PT',
  project_type_tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  service_type_tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  block_type public.proposal_block_type NOT NULL DEFAULT 'editable_text',
  visibility public.proposal_block_visibility NOT NULL DEFAULT 'client',
  default_content text NOT NULL DEFAULT '',
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT proposal_blocks_slug_language_unique UNIQUE (slug, language)
);

CREATE INDEX idx_proposal_blocks_category
  ON public.proposal_blocks (category_id);
CREATE INDEX idx_proposal_blocks_language
  ON public.proposal_blocks (language);
CREATE INDEX idx_proposal_blocks_active
  ON public.proposal_blocks (is_active) WHERE is_active = true;
CREATE INDEX idx_proposal_blocks_project_tags
  ON public.proposal_blocks USING GIN (project_type_tags);
CREATE INDEX idx_proposal_blocks_service_tags
  ON public.proposal_blocks USING GIN (service_type_tags);

ALTER TABLE public.proposal_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read proposal_blocks"
  ON public.proposal_blocks FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins insert proposal_blocks"
  ON public.proposal_blocks FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update proposal_blocks"
  ON public.proposal_blocks FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete proposal_blocks"
  ON public.proposal_blocks FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_proposal_blocks_updated_at
  BEFORE UPDATE ON public.proposal_blocks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 3. quote_proposal_documents (per-quote proposal doc)
-- ============================================================
CREATE TABLE public.quote_proposal_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id uuid NOT NULL REFERENCES public.fee_proposals(id) ON DELETE CASCADE,
  title text NOT NULL,
  language text NOT NULL DEFAULT 'pt-PT',
  status public.quote_proposal_document_status NOT NULL DEFAULT 'draft',
  revision_number integer NOT NULL DEFAULT 1,
  snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamp with time zone,
  sent_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_quote_proposal_documents_quote
  ON public.quote_proposal_documents (quote_id);
CREATE INDEX idx_quote_proposal_documents_status
  ON public.quote_proposal_documents (status);
CREATE INDEX idx_quote_proposal_documents_language
  ON public.quote_proposal_documents (language);

ALTER TABLE public.quote_proposal_documents ENABLE ROW LEVEL SECURITY;

-- Mirror existing fee_proposals access pattern
CREATE POLICY "Authenticated read quote_proposal_documents"
  ON public.quote_proposal_documents FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated insert quote_proposal_documents"
  ON public.quote_proposal_documents FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated update quote_proposal_documents"
  ON public.quote_proposal_documents FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "Authenticated delete quote_proposal_documents"
  ON public.quote_proposal_documents FOR DELETE
  TO authenticated USING (true);

CREATE TRIGGER trg_quote_proposal_documents_updated_at
  BEFORE UPDATE ON public.quote_proposal_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 4. quote_proposal_document_blocks (copied editable instances)
-- ============================================================
CREATE TABLE public.quote_proposal_document_blocks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_document_id uuid NOT NULL REFERENCES public.quote_proposal_documents(id) ON DELETE CASCADE,
  proposal_block_id uuid REFERENCES public.proposal_blocks(id) ON DELETE SET NULL,
  block_title text NOT NULL,
  block_type public.proposal_block_type NOT NULL DEFAULT 'editable_text',
  content text NOT NULL DEFAULT '',
  generated_content jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  is_included boolean NOT NULL DEFAULT true,
  is_locked boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_qp_document_blocks_document
  ON public.quote_proposal_document_blocks (proposal_document_id);
CREATE INDEX idx_qp_document_blocks_master
  ON public.quote_proposal_document_blocks (proposal_block_id);
CREATE INDEX idx_qp_document_blocks_sort
  ON public.quote_proposal_document_blocks (proposal_document_id, sort_order);

ALTER TABLE public.quote_proposal_document_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read quote_proposal_document_blocks"
  ON public.quote_proposal_document_blocks FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated insert quote_proposal_document_blocks"
  ON public.quote_proposal_document_blocks FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated update quote_proposal_document_blocks"
  ON public.quote_proposal_document_blocks FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "Authenticated delete quote_proposal_document_blocks"
  ON public.quote_proposal_document_blocks FOR DELETE
  TO authenticated USING (true);

CREATE TRIGGER trg_qp_document_blocks_updated_at
  BEFORE UPDATE ON public.quote_proposal_document_blocks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();