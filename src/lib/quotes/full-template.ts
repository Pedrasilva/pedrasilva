export const templateSections = ['planning', 'fees', 'payments', 'blocks', 'layout'] as const;
export type TemplateSection = typeof templateSections[number];
export type TemplateSelection = Record<TemplateSection | 'feeValues', boolean>;
export const defaultTemplateSelection: TemplateSelection = {planning:true,fees:true,payments:true,blocks:true,layout:true,feeValues:true};
export type TemplatePreview = {version:number;counts:Record<TemplateSection,number>;existing:Record<TemplateSection,number>;revision:string};
export function replacedSections(preview:TemplatePreview,selection:TemplateSelection):TemplateSection[] {
  return templateSections.filter(section=>selection[section] && preview.existing[section]>0);
}