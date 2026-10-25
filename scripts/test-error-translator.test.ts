import { describe, it, expect, vi } from 'vitest';
import { createInstance } from 'i18next';
import en from '../src/i18n/locales/en/errors.json';
import pt from '../src/i18n/locales/pt-PT/errors.json';
import { errorMessageMap, errorPatternMap } from '../src/lib/error-message-map';
import { translateError, translateErrorMessage } from '../src/lib/translate-error';

const errorToast = vi.fn(() => 'fixture-id');
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: errorToast, success: vi.fn() }) }));
const i18n = createInstance();
await i18n.init({ resources: { en: { errors: en }, 'pt-PT': { errors: pt } }, lng: 'pt-PT', fallbackLng: 'en', interpolation: { escapeValue: false } });
const t = i18n.t.bind(i18n);
function leaf(data: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined, data);
}
describe('display-only server/DB error translation', () => {
  it('every mapped exact/pattern message has paired nonempty EN and PT translations', () => {
    for (const rule of [...errorMessageMap, ...errorPatternMap]) {
      for (const data of [en, pt]) {
        const value = leaf(data, rule.key);
        if (!value) {
          expect(leaf(data, rule.key + '_one'), rule.key).toBeTypeOf('string');
          expect(leaf(data, rule.key + '_other'), rule.key).toBeTypeOf('string');
        } else expect(value, rule.key).toBeTypeOf('string');
      }
    }
    expect(new Set(errorMessageMap.map(r => r.message)).size).toBe(errorMessageMap.length);
  });
  it('translates approval rejection exactly, without mutating an RPC error', () => {
    const error = Object.freeze({ message: 'No valid approval for the current content', code: 'P0001' });
    expect(translateError(error, t)).toBe('Não existe uma aprovação válida para o conteúdo atual.');
    expect(error.message).toBe('No valid approval for the current content');
    expect(error.code).toBe('P0001');
  });
  it('translates persisted story failure at display only', () => {
    expect(translateErrorMessage('Story frames need re-rendering, open the post and approve again', t)).toBe('Os frames da story precisam de nova renderização; abra o post e aprove novamente.');
  });
  it('extracts interpolated status without modifying the stored enum', () => {
    expect(translateErrorMessage('Item is already removed', t)).toBe('O item já está removed.');
    expect(translateErrorMessage('Action not allowed for contract status "signed"', t)).toBe('A ação não é permitida para o estado do contrato «signed».');
  });
  it('handles anchored HTTP patterns and nested known details', () => {
    expect(translateErrorMessage('Meta redirected unexpectedly (HTTP 302)', t)).toBe('A Meta redirecionou inesperadamente (HTTP 302).');
    expect(translateErrorMessage('Publication check rejected: No valid approval for the current content', t)).toBe('Verificação de publicação rejeitada: Não existe uma aprovação válida para o conteúdo atual.');
  });
  it('uses natural singular/plural for generated slide counts', () => {
    expect(translateErrorMessage('1 text slide(s) still need a design', t)).toBe('1 diapositivo de texto ainda precisa de um design.');
    expect(translateErrorMessage('2 text slide(s) still need a design', t)).toBe('2 diapositivos de texto ainda precisam de um design.');
  });
  it('unknown provider messages and near-matches remain verbatim', () => {
    for (const raw of ['(#190) Opaque provider diagnostic', '  No valid approval for the current content  ', 'Prefix Item is already removed', '']) expect(translateErrorMessage(raw, t)).toBe(raw);
  });
  it('English uses the same paired key at render time', async () => {
    await i18n.changeLanguage('en');
    expect(translateErrorMessage('No valid approval for the current content', t)).toBe('No valid approval for the current content');
    await i18n.changeLanguage('pt-PT');
  });
  it('toast boundary preserves ID/options and translates error descriptions', async () => {
    const appI18n = (await import('../src/i18n/index')).default;
    await appI18n.changeLanguage('pt-PT');
    const { toast } = await import('../src/lib/toast');
    expect(toast.error('No valid approval for the current content', { id: 'local', duration: 7000, description: 'Draft not found' })).toBe('fixture-id');
    expect(errorToast).toHaveBeenCalledWith('Não existe uma aprovação válida para o conteúdo atual.', { id: 'local', duration: 7000, description: 'Rascunho não encontrado.' });
  });
});
