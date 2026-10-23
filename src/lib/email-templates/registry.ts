import type { ComponentType } from 'react'
import { template as expenseApprovedTemplate } from './expense-approved'
import { template as remoteWorkLateTemplate } from './remote-work-late'
import { template as timesheetReminderTemplate } from './timesheet-reminder'
import { template as marketingNudgeTemplate } from './marketing-nudge'
import { template as marketingActionTemplate } from './marketing-action'
import { template as marketingPostApprovalTemplate } from './marketing-post-approval'
import { template as marketingPublishFailedTemplate } from './marketing-publish-failed'
import { template as timesheetWeekUpdateTemplate } from './timesheet-week-update'
import { template as financeForwardTemplate } from './finance-forward'
import { template as leaveChangeTemplate } from './leave-change'
import { template as baixaMedicaSubmittedTemplate } from './baixa-medica-submitted'


export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 *
 * Example:
 *   import { template as welcomeTemplate } from './welcome'
 *   // then add to TEMPLATES: 'welcome': welcomeTemplate
 */
export const TEMPLATES: Record<string, TemplateEntry> = {
  'expense-approved': expenseApprovedTemplate,
  'remote-work-late': remoteWorkLateTemplate,
  'timesheet-reminder': timesheetReminderTemplate,
  'marketing-nudge': marketingNudgeTemplate,
  'marketing-action': marketingActionTemplate,
  'marketing-post-approval': marketingPostApprovalTemplate,
  'marketing-publish-failed': marketingPublishFailedTemplate,
  'timesheet-week-update': timesheetWeekUpdateTemplate,
  'finance-forward': financeForwardTemplate,
  'leave-change': leaveChangeTemplate,
  'baixa-medica-submitted': baixaMedicaSubmittedTemplate,
}

