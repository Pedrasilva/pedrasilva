import { describe, it, expect } from 'vitest';
import { resolveMaster, masterVariables, logoLeft, snapMm, pageVariant, validMaster,masterElement,moveMasterElement,nudgeMasterElement,safeBottomMargin,furnitureVariant } from '../src/lib/psa-proposal/master-page';
describe('Master page rules', () => {
  it('moves footer with 1pt keys and 10pt shift keys without mutating source',()=>{
    const m=resolveMaster(),p=masterElement(m,'footer');
    expect(masterElement(nudgeMasterElement(m,'footer','ArrowUp'),'footer').y).toBeCloseTo(p.y-25.4/72);
    expect(masterElement(nudgeMasterElement(m,'footer','ArrowUp',true),'footer').y).toBeCloseTo(p.y-10*25.4/72);
    expect(m.footer.position).toBeUndefined();
  });
  it('reserves text clearance above a moved footer',()=>{
    const m=moveMasterElement(resolveMaster(),'footer',{y:240});
    expect(safeBottomMargin(m)).toBe(60);
    expect(masterVariables(m)['--psa-margin-bottom']).toBe('60mm');
  });
  it('reserves clearance for a footer child moved above its group',()=>{
    const m=moveMasterElement(moveMasterElement(resolveMaster(),'footer',{y:250}),'footerAddress',{y:-10});
    expect(safeBottomMargin(m)).toBe(60);
  });
  it('controls cover and letter footer visibility independently',()=>{
    const m=resolveMaster();m.footer.hideOnCover=false;m.footer.hideOnLetter=true;
    expect(furnitureVariant(m,'cover').footer.show).toBe(true);
    expect(furnitureVariant(m,'letter').footer.show).toBe(false);
    expect(furnitureVariant(m,'content').footer.show).toBe(true);
  });
  it('preserves legacy margins and independent logo coordinates without changing input', () => {
    const input = { marginLeft: 30, showFooter: false }; const m = resolveMaster(input);
    expect(m.margins).toEqual({ top: 34, bottom: 32, left: 30, right: 14 }); expect(m.logo.x).toBe(14); expect(m.footer.show).toBe(false); expect(input).toEqual({ marginLeft: 30, showFooter: false });
  });
  it('drives all four margins in millimetres', () => {
    const m = resolveMaster(); m.margins = { top: 40, bottom: 35, left: 30, right: 20 };
    expect(masterVariables(m)['--psa-margin-left']).toBe('30mm'); expect(masterVariables(m)['--psa-margin-right']).toBe('20mm'); expect(masterVariables(m)['--psa-margin-top']).toBe('40mm'); expect(masterVariables(m)['--psa-margin-bottom']).toBe('35mm');
  });
  it('limits cover overrides to page one', () => {
    const m = resolveMaster(); m.firstPage = { enabled: true, showHeader: false, showFooter: false, logo: { alignment: 'centre', x: 105, y: 15, width: 40 } };
    expect(pageVariant(m,true).header.show).toBe(false); expect(pageVariant(m,true).logo.x).toBe(105); expect(pageVariant(m,false).header.show).toBe(true); expect(pageVariant(m,false).logo.x).toBe(14);
  });
  it('aligns and snaps using physical coordinates', () => {
    expect(logoLeft({ alignment:'centre',x:105,y:8,width:40 })).toBe(85); expect(logoLeft({ alignment:'right',x:196,y:8,width:40 })).toBe(156); expect(snapMm(29.4,[30])).toBe(30); expect(snapMm(26,[30])).toBe(26);
  });
  it('rejects impossible page margins and accepts legacy geometry', () => {
    const m = resolveMaster(); expect(validMaster(m)).toBe(true); m.margins.left = 100; m.margins.right = 100; expect(validMaster(m)).toBe(false);
  });
});