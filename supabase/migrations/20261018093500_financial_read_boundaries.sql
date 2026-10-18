-- Keep administrator oversight; entity users may read only authorized tax history.
ALTER POLICY "finance reads tax number log"
ON public.tax_number_change_log TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (
    public.is_finance_user(auth.uid())
    AND (
      (record_table = 'companies' AND (
        public.is_psa_staff() OR public.fin_company_visible(record_id)
      ))
      OR (record_table = 'financial_documents' AND EXISTS (
        SELECT 1 FROM public.financial_documents d
        WHERE d.id = record_id AND public.fin_row_visible(d.entity_id)
      ))
    )
  )
);

-- Project financial permission is independent of the Finance entity switcher.
-- The legacy finance permission retains its entity-scoped branch for PSA staff.
ALTER POLICY "Authorized read pm_invoices"
ON public.pm_invoices TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (
    public.is_psa_staff()
    AND entity_id = '00000000-0000-4000-a000-000000000001'::uuid
    AND (
      public.has_module_permission(auth.uid(), 'projects.view_financials', 'all')
      OR (public.has_module_permission(auth.uid(), 'projects.view_financials', 'assigned')
          AND public.pm_has_assigned_access(auth.uid(), project_id))
      OR (public.has_permission(auth.uid(), 'finance.dashboard')
          AND public.fin_row_visible(entity_id))
    )
  )
);

-- General legacy projects.view is deliberately not a financial-read permission.
ALTER POLICY "Authorized read pm_payment_schedule_items"
ON public.pm_payment_schedule_items TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (
    public.is_psa_staff()
    AND entity_id = '00000000-0000-4000-a000-000000000001'::uuid
    AND (
      public.has_module_permission(auth.uid(), 'projects.view_financials', 'all')
      OR (public.has_module_permission(auth.uid(), 'projects.view_financials', 'assigned')
          AND public.pm_has_assigned_access(auth.uid(), project_id))
      OR (public.has_permission(auth.uid(), 'finance.dashboard')
          AND public.fin_row_visible(entity_id))
    )
  )
);