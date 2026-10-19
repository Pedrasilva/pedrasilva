import {describe,it,expect} from "vitest";
import {leaveBalance,pendingApprovals,pendingByCollaborator,type ApprovalRow} from "../src/lib/hr/approval-inbox";
const row=(id:string,kind:ApprovalRow["kind"],submitted:string,status="pendente",collaboratorId="a"):ApprovalRow=>({id,kind,submitted,status,collaboratorId,collaborator:"QA",type:"ferias",start:"2099-01-05",end:"2099-01-05",days:1,notes:null,attachment:null,canDecide:true,canApprove:true,blockReason:null,balance:20,decidedAt:null,decidedBy:null,requestId:id});
describe("HR approval inbox",()=>{
 it("includes all three pending request sources",()=>expect(pendingApprovals([row("l","leave","2099-01-01"),row("c","change","2099-01-02"),row("r","remote","2099-01-03")]).map(r=>r.kind)).toEqual(["leave","change","remote"]));
 it("excludes approved rejected accepted refused and cancelled requests",()=>expect(pendingApprovals(["aprovada","rejeitada","aceite","recusada","cancelada"].map((s,i)=>row(String(i),"leave","2099-01-01",s)))).toEqual([]));
 it("sorts oldest first",()=>expect(pendingApprovals([row("new","remote","2099-01-03"),row("old","leave","2099-01-01")]).map(r=>r.id)).toEqual(["old","new"]));
 it("counts requests rather than vacation days, including sick/unpaid",()=>{const sick={...row("s","leave","2099-01-01"),type:"baixa_medica",days:3};const unpaid={...row("u","leave","2099-01-01"),type:"autorizada_nao_paga",days:2};expect(pendingByCollaborator([sick,unpaid,row("r","remote","2099-01-02","pendente","b")])).toEqual({a:2,b:1});});
 const p={dias_ferias_anuais:22,saldo_ferias_anterior:2,dias_ferias_extra:1};
 const leave=(tipo:string,estado:string,dias_uteis:number,data_inicio="2099-01-01")=>({tipo,estado,dias_uteis,data_inicio});
 it("deducts approved and pending vacation once",()=>expect(leaveBalance(p,[leave("ferias","aprovada",5),leave("ferias","pendente",3)],2099)).toBe(17));
 it("never deducts sick unpaid remote or rejected/cancelled leave",()=>expect(leaveBalance(p,[leave("baixa_medica","pendente",3),leave("autorizada_nao_paga","aprovada",2),leave("remote","pendente",1),leave("ferias","rejeitada",4),leave("ferias","cancelada",4)],2099)).toBe(25));
 it("uses existing start-year rule",()=>expect(leaveBalance(p,[leave("ferias","aprovada",3,"2098-12-31")],2099)).toBe(25));
 it("approval does not double-deduct the already pending vacation",()=>expect(leaveBalance(p,[leave("ferias","pendente",3)],2099)).toBe(leaveBalance(p,[leave("ferias","aprovada",3)],2099)));
});