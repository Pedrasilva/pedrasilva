import { describe, it, expect } from 'vitest';
import { numberStages, buildStageNumberMap, sortStagesByWbs, sortStageLinkedRows, isConstructionStage, stageOrderRanks, sortRowsByStageRank } from '../src/lib/quotes/stage-numbering';

const stages = [
  { id:'retainer', name:'Assistência Técnica à Obra', sort_order:6, stage_kind:'retainer_monthly', billing_model:'retainer' },
  { id:'design', name:'Programa Base', sort_order:10 },
  { id:'child', name:'Detalhe', sort_order:11, parent_stage_id:'design' },
  { id:'execution', name:'Projeto de Execução', sort_order:60 },
  { id:'month', name:'Novembro', sort_order:6001, parent_stage_id:'retainer' },
];
describe('manual Gantt stage order', () => {
  it('follows manual hierarchy even when construction is placed first', () => {
    expect(sortStagesByWbs(stages).map(s=>s.id)).toEqual(['retainer','month','design','child','execution']);
  });
  it('preserves the original WBS numbers, including construction number 1', () => {
    expect(Object.fromEntries(buildStageNumberMap(stages))).toEqual({design:'2',child:'2.1',execution:'3',retainer:'1',month:'1.1'});
  });
  it('does not mutate data, dates, amounts or baseline arrays', () => {
    const baseline=stages.map(s=>Object.freeze({...s,start_date:'2026-06-01',amount:1320}));
    const before=JSON.stringify(baseline); numberStages(baseline); sortStagesByWbs(baseline);
    expect(JSON.stringify(baseline)).toBe(before);
  });
  it('keeps instalments stable in the manual Gantt stage order', () => {
    const rows=[{id:'m1',stage_id:'month'},{id:'d1',stage_id:'design'},{id:'m2',stage_id:'month'},{id:'e1',stage_id:'execution'}];
    expect(sortStageLinkedRows(rows,stages).map(r=>r.id)).toEqual(['m1','m2','d1','e1']);
  });
  it('compares full-tree ranks, not local sibling positions, when groups flatten', () => {
    const tree=[{id:'root',name:'Architecture',sort_order:1},{id:'programme',name:'Programme',parent_stage_id:'root',sort_order:1},{id:'concept',name:'Concept',parent_stage_id:'root',sort_order:2},{id:'construction',name:'Construction',parent_stage_id:'root',sort_order:6},{id:'tender',name:'Tender',parent_stage_id:'construction',sort_order:1}];
    expect(sortRowsByStageRank([tree[4],tree[2],tree[1]],stageOrderRanks(tree),s=>s.id).map(s=>s.id)).toEqual(['programme','concept','tender']);
  });
  it('preserves advance slots and amounts while sorting linked payments', () => {
    const rows=[{id:'execution',stage_id:'execution',amount:50},{id:'advance',stage_id:null,amount:100},{id:'design',stage_id:'design',amount:20}];
    expect(sortStageLinkedRows(rows,stages).map(r=>[r.id,r.amount])).toEqual([['design',20],['advance',100],['execution',50]]);
  });
  it.each(['Assistencia Tecnica a Obra','Assistência Técnica à Obra','retainer','avença','Construction technical assistance'])('recognizes legacy assistance label %s', name => {
    expect(isConstructionStage({name})).toBe(true);
  });
  it('does not classify ordinary construction design as assistance', () => {
    expect(isConstructionStage({name:'Construction drawings'})).toBe(false);
  });
});