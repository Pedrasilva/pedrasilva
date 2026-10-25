/** UI eligibility only; database guards remain authoritative. */
export function approvalActions(status: string, validApproval: boolean, locked: boolean, unsaved = false) {
  const recoverable = ['failed', 'approved', 'scheduled'].includes(status);
  return {
    needsReapproval: recoverable && (!validApproval || unsaved),
    canApprove: !locked && (status === 'suggested' || (recoverable && (!validApproval || unsaved))),
    canPublish: !locked && recoverable && validApproval && !unsaved,
  };
}