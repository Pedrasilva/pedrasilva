import i18n from '@/i18n/index';
import type { TFunction } from 'i18next';
import { errorMessageMap, errorPatternMap } from './error-message-map';

const exact = new Map<string, string>(errorMessageMap.map(entry => [entry.message, entry.key]));
const patterns = errorPatternMap.map(entry => ({ ...entry, regex: new RegExp(entry.pattern) }));

/** Presentation only: never modifies an Error, stored message, code or RPC result. */
export function translateErrorMessage(message: string, t: TFunction = i18n.t.bind(i18n)): string {
  const key = exact.get(message);
  if (key) return t(`errors:${key}`, { defaultValue: message });
  for (const rule of patterns) {
    const match = rule.regex.exec(message);
    if (!match) continue;
    const values: Record<string, string | number> = {};
    rule.names.forEach((name, index) => {
      const value = match[index + 1] ?? '';
      values[name] = name === 'count' ? Number(value) : name === 'detail' ? translateErrorMessage(value, t) : value;
    });
    return t(`errors:${rule.key}`, { ...values, defaultValue: message });
  }
  return message;
}

/** Objects returned by RPCs need not be Error instances. Unknown text is preserved verbatim. */
export function translateError(error: unknown, t: TFunction = i18n.t.bind(i18n)): string {
  if (typeof error === 'string') return translateErrorMessage(error, t);
  if (error instanceof Error) return translateErrorMessage(error.message, t);
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return translateErrorMessage(error.message, t);
  }
  return String(error);
}
