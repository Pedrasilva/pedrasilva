GRANT DELETE ON public.marketing_nudges TO authenticated;
CREATE POLICY mn_delete_curator ON public.marketing_nudges FOR DELETE TO authenticated
  USING (public.has_module_permission(auth.uid(), 'marketing.curate', 'all'));