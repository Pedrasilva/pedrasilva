import { describe, it, expect } from 'vitest';
import { captureProjectPatch,safeProfileForAI,redactProtectedNames } from '../src/lib/marketing/portfolio';
describe('Marketing-only portfolio rules',()=>{
  const portfolio={id:'portfolio-key',name:'[TEST] Courtyard House',profile_id:'profile-key',portfolio:true};
  const live={id:'live-project',name:'[TEST] live',profile_id:'live-profile',portfolio:false};
  it('portfolio capture links a profile, never an operational project',()=>expect(captureProjectPatch(portfolio.id,[portfolio,live])).toEqual({project_id:null,profile_id:'profile-key'}));
  it('live capture preserves the live reference',()=>expect(captureProjectPatch(live.id,[portfolio,live])).toEqual({project_id:'live-project',profile_id:'live-profile'}));
  it('removing project also removes profile',()=>expect(captureProjectPatch(null,[portfolio])).toEqual({project_id:null,profile_id:null}));
  it('describe-only keeps internal names and aliases out of AI',()=>expect(safeProfileForAI({name_rule:'describe_only',project_name:'Secret project',client:'Global Brand',aliases:['Global']})).toEqual({name_rule:'describe_only',project_name:null,client:null,aliases:[]}));
  it('allowed naming retains the client',()=>expect(safeProfileForAI({name_rule:'name',client:'Allowed Brand'}).client).toBe('Allowed Brand'));
  it('confidential profiles hide geography',()=>expect(safeProfileForAI({name_rule:'never_mention',sector:'healthcare',location:'Lisbon'})).toMatchObject({sector:null,location:null}));
  it('free text cannot repeat protected clients case-insensitively',()=>expect(redactProtectedNames('GLOBAL BRAND: courtyard for Global Brand',['Global Brand'])).toBe('[confidential project]: courtyard for [confidential project]'));
});