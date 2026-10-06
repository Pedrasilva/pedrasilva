# HR rules

- Changes to leave (vacation_requests) after approval go only through the DB functions leave_change_submit / leave_change_decide / leave_direct_change (ownership, no self-approval, no overlaps, history in vacation_request_history, bell notifications); cancelled leave becomes estado "cancelada", never deleted; emails follow via sendLeaveChangeEmails. Why: the existing timesheet sync trigger rebuilds leave hours from the request, so one write path keeps balance, timesheet and hours bank consistent.
