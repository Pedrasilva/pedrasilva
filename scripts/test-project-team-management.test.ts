import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PERMISSION_BY_KEY, hasModuleScope } from '../src/lib/permissions-v2';

describe('individually delegated project team management', () => {
  it('requires the all-project scope, never assigned-project scope', () => {
    expect(PERMISSION_BY_KEY.get('projects.manage_teams')?.scopes).toEqual(['all']);
    expect(hasModuleScope([{key:'projects.manage_teams',scope:'assigned',source:'override'}], 'projects.manage_teams', 'all')).toBe(false);
    expect(hasModuleScope([{key:'projects.manage_teams',scope:'all',source:'override'}], 'projects.manage_teams', 'all')).toBe(true);
  });
  it('does not treat financial access or a role as delegated team management', () => {
    expect(hasModuleScope([{key:'projects.view_financials',scope:'all',source:'role'}], 'projects.manage_teams', 'all')).toBe(false);
    expect(hasModuleScope([], 'projects.manage_teams', 'all')).toBe(false);
  });
  it('ships the identical live migration without automatic user grants', () => {
    const migration=readFileSync('drizzle/migrations/0279_project_team_management_capability.sql','utf8');
    expect(readFileSync('supabase/migrations/20261111163500_project_team_management_capability.sql','utf8')).toBe(migration);
    expect(migration).not.toMatch(/INSERT INTO public\.(user_permissions|user_roles|role_permissions)/i);
  });
});