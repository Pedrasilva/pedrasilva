import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const sql = readFileSync('supabase/migrations/20261114102000_proposal_category_sale_defaults.sql','utf8');
describe('category sale defaults database rules',()=>{
 it('copies defaults only into new roots, not existing proposals or revisions',()=>{expect(sql).toContain('IF NEW.parent_quote_id IS NULL'); expect(sql).toContain('AFTER INSERT ON public.fee_proposals'); expect(sql).not.toContain('AFTER UPDATE ON public.proposal_roles');});
 it('never replaces manual quote sale values',()=>{expect(sql).toContain('ON CONFLICT(quote_id,role_name) DO NOTHING');});
 it('protects default edits through the server admin role',()=>{expect(sql).toContain("NOT public.has_role(auth.uid(),'admin')");});
});
