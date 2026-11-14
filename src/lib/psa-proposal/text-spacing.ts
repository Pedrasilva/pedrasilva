export const PSA_TEXT_SPACING = {
  bodyLeading: 1.4, paragraphSpace: 6, listLeading: 1.4,
  listItemSpace: 3, listBefore: 3, listAfter: 6,
  listIndent: 14, markerGap: 4,
  h2Before: 18, h2After: 6, h3Before: 12, h3After: 4,
  tablePadding: 3, tableBefore: 6, tableAfter: 6, tableNoteBefore: 3,
};
export type TextSpacing = typeof PSA_TEXT_SPACING;
export const SPACING_PRESETS: Record<'compact'|'standard'|'airy', TextSpacing> = {
  compact: {...PSA_TEXT_SPACING, bodyLeading:1.2,listLeading:1.2,paragraphSpace:3,listItemSpace:1,listBefore:2,listAfter:3,h2Before:12,h2After:4,h3Before:8,h3After:3,tablePadding:2,tableBefore:3,tableAfter:3,tableNoteBefore:2},
  standard: {...PSA_TEXT_SPACING},
  airy: {...PSA_TEXT_SPACING,bodyLeading:1.65,listLeading:1.65,paragraphSpace:10,listItemSpace:6,listBefore:6,listAfter:10,h2Before:24,h2After:10,h3Before:18,h3After:8,tablePadding:6,tableBefore:10,tableAfter:10,tableNoteBefore:6},
};
export function resolveTextSpacing(master?: Partial<TextSpacing>, override?: Partial<TextSpacing>, enabled=false): TextSpacing {
  return {...PSA_TEXT_SPACING,...master,...(enabled?override:{})};
}
export function textSpacingVariables(s: TextSpacing): Record<string,string> {
  const token: Record<keyof TextSpacing,string> = {bodyLeading:'body-leading',paragraphSpace:'paragraph-gap',listLeading:'list-leading',listItemSpace:'list-item-gap',listBefore:'list-before',listAfter:'list-after',listIndent:'list-indent',markerGap:'marker-gap',h2Before:'h2-before',h2After:'h2-after',h3Before:'h3-before',h3After:'h3-after',tablePadding:'table-padding',tableBefore:'table-before',tableAfter:'table-after',tableNoteBefore:'table-note-before'};
  return Object.fromEntries(Object.entries(s).map(([key,value])=>[`--psa-${token[key as keyof TextSpacing]}`,`${value}${key==='bodyLeading'||key==='listLeading'?'':'pt'}`]));
}