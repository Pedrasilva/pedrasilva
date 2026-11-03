import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),visible:vi.fn()}));
vi.mock('../src/integrations/supabase/client',()=>({supabase:{from:()=>({select:()=>({eq:()=>({then:(resolve:unknown)=>Promise.resolve(mocks.visible()).then(resolve as (v:unknown)=>unknown)})})}),rpc:mocks.rpc}}));
import {readProjectIncomingRows} from '../src/lib/finance/project-incoming-reader';
describe('Finance operational incoming reader',()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.visible.mockReturnValue({data:[{project_id:'fixture'},{project_id:'fixture'}],error:null});});
 it('returns live July 8 receipt date once instead of the source proposal June 8 date',async()=>{
  mocks.rpc.mockResolvedValue({data:{rows:[{id:'payment-copy',planned_invoice_date:'2026-06-08',planned_payment_date:'2026-07-08'}]},error:null});
  const rows=await readProjectIncomingRows();
  expect(rows[0].planned_payment_date).toBe('2026-07-08');
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.rpc).toHaveBeenCalledWith('pm_project_incoming_timing',{_project:'fixture'});
 });
 it('preserves unreadable terms as a missing receipt date',async()=>{
  mocks.rpc.mockResolvedValue({data:{rows:[{id:'unknown-copy',planned_payment_date:null,problems:['paymentTermsUnreadable']}]},error:null});
  expect((await readProjectIncomingRows())[0].planned_payment_date).toBeNull();
 });
 it('does not return financial values when the project projection denies access',async()=>{
  mocks.rpc.mockResolvedValue({data:null,error:new Error('Forbidden')});
  await expect(readProjectIncomingRows()).rejects.toThrow('Forbidden');
 });
});