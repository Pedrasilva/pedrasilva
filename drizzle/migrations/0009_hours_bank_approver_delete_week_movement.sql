CREATE POLICY "bank_delete_week_movement" ON public.pm_hours_bank_entries FOR DELETE TO authenticated
USING (
  week_id IS NOT NULL
  AND transaction_type IN ('additional_hours','shortfall')
  AND public.pm_can_approve_hours(auth.uid())
);