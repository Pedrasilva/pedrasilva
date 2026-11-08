/** B1 preview marker rule (pure, shared with tests). The database applies the same rule
 * in pm_project_b1_header_preview: admin only, read-only transactions only. */
export const B1_PREVIEW_HEADER = 'x-psa-b1-preview';

/** Forward only "on" from an administrator with a bearer session; everyone else is ignored. */
export function shouldForwardB1Preview(marker: string | null | undefined, auth: string | null | undefined, isAdmin: boolean): boolean {
  return marker === 'on' && !!auth?.startsWith('Bearer ') && isAdmin === true;
}
