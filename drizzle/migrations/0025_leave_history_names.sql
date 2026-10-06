CREATE OR REPLACE FUNCTION public.leave_request_history(_req uuid)
RETURNS TABLE(id uuid, action text, reason text, created_at timestamptz, actor_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT h.id, h.action, h.reason, h.created_at, COALESCE(c.nome, u.email)::text
  FROM public.vacation_request_history h
  LEFT JOIN auth.users u ON u.id = h.actor_id
  LEFT JOIN public.collaborators c ON lower(c.email) = lower(u.email)
  WHERE h.request_id = _req
    AND (public.can_approve_leave(auth.uid())
      OR EXISTS (SELECT 1 FROM public.vacation_requests v WHERE v.id = _req AND v.collaborator_id = public.get_my_collaborator_id())
      OR EXISTS (SELECT 1 FROM public.vacation_change_requests x WHERE x.request_id = _req AND x.recipient_id = auth.uid()))
  ORDER BY h.created_at DESC
$$;
REVOKE EXECUTE ON FUNCTION public.leave_request_history(uuid) FROM anon;