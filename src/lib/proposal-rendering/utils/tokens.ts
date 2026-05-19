/**
 * Deterministic token replacement for proposal templates.
 * Tokens use {{snake_case}} syntax. Unknown tokens collapse to an empty
 * string rather than leaking braces into the output.
 */
import type { RenderTokens } from "../types";

const TOKEN_RX = /\{\{\s*([a-z0-9_]+)\s*\}\}/g;

export function applyTokens(template: string, tokens: RenderTokens): string {
  return template.replace(TOKEN_RX, (_, raw: string) => {
    const key = raw as keyof RenderTokens;
    const v = tokens[key];
    return v == null ? "" : String(v);
  });
}

export function applyTokensAll(
  templates: string[],
  tokens: RenderTokens,
): string[] {
  return templates.map((t) => applyTokens(t, tokens));
}
