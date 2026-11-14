import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { PSA_TEXT_SPACING, SPACING_PRESETS, type TextSpacing } from '@/lib/psa-proposal/text-spacing';

export function TextSpacingControls({value,onChange,disabled=false,override,onOverride,onReset}:{value:TextSpacing;onChange:(s:TextSpacing)=>void;disabled?:boolean;override?:boolean;onOverride?:(v:boolean)=>void;onReset?:()=>void}) {
  const {t,i18n}=useTranslation('crm');
  return <section className="space-y-3 border-t pt-3">
    <h3 className="text-sm font-semibold">{t('textSpacing.title')}</h3>
    {onOverride&&<div className="flex items-center justify-between gap-2"><Label htmlFor="spacing-override">{t('textSpacing.override')}</Label><Switch id="spacing-override" disabled={disabled} checked={override} onCheckedChange={onOverride}/></div>}
    <fieldset disabled={disabled || (onOverride!==undefined&&!override)} className="space-y-3">
      <div className="flex flex-wrap gap-1">{(['compact','standard','airy'] as const).map(p=><Button key={p} size="sm" variant="outline" onClick={()=>onChange({...SPACING_PRESETS[p]})}>{t(`textSpacing.${p}`)}</Button>)}</div>
      {(Object.keys(PSA_TEXT_SPACING) as (keyof TextSpacing)[]).map(key=>{
        const leading=key==='bodyLeading'||key==='listLeading';
        return <div key={key} className="space-y-1"><div className="flex items-start justify-between gap-2"><Label htmlFor={`spacing-${key}`} className="text-xs">{t(`textSpacing.${key}`)}</Label><span className="shrink-0 text-xs tabular-nums">{value[key].toLocaleString(i18n.language,{maximumFractionDigits:2})}{leading?'':` ${t('quoteEditor.pointSuffix')}`}</span></div><Slider id={`spacing-${key}`} aria-label={t(`textSpacing.${key}`)} min={leading?1.2:0} max={leading?1.8:key==='h2Before'||key==='h3Before'?36:key==='listIndent'?36:18} step={leading?0.05:0.5} value={[value[key]]} onValueChange={([v])=>{if(v!==undefined)onChange({...value,[key]:v});}}/></div>;
      })}
      <Button size="sm" variant="outline" onClick={()=>onChange({...PSA_TEXT_SPACING})}>{t('textSpacing.resetPsa')}</Button>
    </fieldset>
    {onReset&&<Button size="sm" variant="outline" disabled={disabled} onClick={onReset}>{t('textSpacing.resetMaster')}</Button>}
  </section>;
}