import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { getApprovalInbox, decideInboxRequest } from "./approval-inbox.functions";
import { sendLeaveChangeEmails } from "./leave-change-email.functions";
import { pendingByCollaborator, type ApprovalRow } from "./approval-inbox";
export function useApprovalInbox(pedido?: string, enabled = true) {
  const read = useServerFn(getApprovalInbox);
  const {user, viewAsUser, loading} = useAuth();
  const query = useQuery({queryKey:["hr-approval-inbox",user?.id,pedido ?? ""],enabled:enabled && !!user && !viewAsUser && !loading,queryFn:() => read({data:{pedido}}),staleTime:15_000,refetchInterval:60_000});
  const rows = query.data?.rows ?? [];
  return {...query,rows,allowed:!viewAsUser && !!query.data?.allowed,counts:pendingByCollaborator(rows)};
}
export function useInboxDecision() {
  const decide = useServerFn(decideInboxRequest);
  const email = useServerFn(sendLeaveChangeEmails);
  const qc = useQueryClient();
  return useMutation({mutationFn:async ({row,approve,reason=""}:{row:ApprovalRow;approve:boolean;reason?:string}) => {
    await decide({data:{id:row.id,kind:row.kind,approve,reason}});
    if(row.kind !== "remote") void email({data:{requestId:row.requestId}}).catch(() => {});
  },onSuccess:async () => {await Promise.all(["hr-approval-inbox","vacation_requests","vacation_change_requests","vacation_request_history","remote_work_requests","home","notifications"].map(key => qc.invalidateQueries({queryKey:[key]})));}});
}