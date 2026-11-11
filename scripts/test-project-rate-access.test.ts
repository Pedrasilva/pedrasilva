import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const migration = readFileSync(new URL('../drizzle/migrations/0273_project_scoped_hr_rate_reads.sql', import.meta.url), 'utf8');
const single = readFileSync(new URL('../drizzle/migrations/0274_project_scoped_single_resource_read.sql', import.meta.url), 'utf8');
const server = readFileSync(new URL('../src/lib/projects/default-rates.functions.ts', import.meta.url), 'utf8');
describe('project-scoped rate security contract', () => {
  it('requires caller staff and this project Financials, not a name or global HR permission', () => {
    const gate = migration.slice(0,migration.indexOf('REVOKE ALL'));
    expect(gate).toContain('public.is_psa_staff()');
    expect(gate).toContain("public.can_view_project_area(_project,'financials')");
    expect(gate).not.toContain('pm_project_b1_active');
  });
  it('denies direct list, preview and nested single-resource reads through the same gate', () => {
    expect(migration).toContain('IF NOT public.pm_project_rate_access(_project) THEN RETURN; END IF;');
    expect(single).toContain('IF NOT public.pm_project_rate_access(_project) THEN RETURN NULL; END IF;');
  });
  it('checks caller project access before reading privileged HR data in either gate state', () => {
    const check = server.indexOf("supabase.rpc('pm_project_rate_access'");
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(server.indexOf("import('@/integrations/supabase/client.server')"));
    expect(server.slice(check,server.indexOf("import('@/integrations/supabase/client.server')"))).toContain('if (!allowed) return []');
  });
  it('keeps the approved 1.75 Projects multiplier unchanged', () => {
    expect(server).toMatch(/PROJECT_DEFAULT_MARGIN\s*=\s*0\.75/);
    expect(server).toContain('margemLucroPct: PROJECT_DEFAULT_MARGIN');
  });
});