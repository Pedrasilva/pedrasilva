import {describe,it,expect} from "vitest";
import {SYSTEM_BLOCK_TITLES,resolveBlockTitle} from "../src/lib/psa-proposal/system-titles";
const KINDS=["cover","index","about","scope","stage_list","stage_item","timeline","consultants","fee_table","construction_fee","payment_terms","payment_schedule","additional_services","general","suspension","exclusions","acceptance","custom_text","page_break","gantt_design","gantt_construction","supplier_fee_table","optional_fee_table","appendix_index","appendix_payment_schedule","appendix_gantt","appendix_general_terms","travel_expenses","gantt_partial","billable_hourly_rate","image"];
describe("proposal system headings follow the proposal language",()=>{
  it("covers every block type",()=>{for(const k of KINDS)expect(SYSTEM_BLOCK_TITLES[k],k).toBeDefined();});
  it("switching PT↔EN leaves no system heading in the other language",()=>{
    for(const k of KINDS){const {en,pt}=SYSTEM_BLOCK_TITLES[k];
      for(const stored of [pt,en,`${pt} (cópia)`,""]){
        expect(resolveBlockTitle(k,stored,"en")).toBe(en);
        expect(resolveBlockTitle(k,stored,"pt-PT")).toBe(pt);
      }}
  });
  it("the reported stage list heading becomes English",()=>expect(resolveBlockTitle("stage_list","Organização do Projeto e Fases","en")).toBe("Project Organization & Stages"));
  it("user-edited headings are never replaced",()=>{
    expect(resolveBlockTitle("about","Why Pedra Silva Arquitectos","pt-PT")).toBe("Why Pedra Silva Arquitectos");
    expect(resolveBlockTitle("stage_list","Organização do Projeto","en")).toBe("Organização do Projeto");
  });
});
import {canResetBlockTitle,standardBlockTitleForStorage} from "../src/lib/psa-proposal/system-titles";
describe("reset to standard heading",()=>{
  it("offered only on customised headings",()=>{
    expect(canResetBlockTitle("stage_list","Organização do Projeto e Fases")).toBe(false);
    expect(canResetBlockTitle("stage_list","Project Organization & Stages")).toBe(false);
    expect(canResetBlockTitle("stage_list","Our approach")).toBe(true);
  });
  it("after reset the heading follows the proposal language again",()=>{
    const saved=standardBlockTitleForStorage("stage_list")!;
    expect(resolveBlockTitle("stage_list",saved,"en")).toBe("Project Organization & Stages");
    expect(resolveBlockTitle("stage_list",saved,"pt-PT")).toBe("Organização do Projeto e Fases");
  });
});
