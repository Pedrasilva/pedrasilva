/**
 * Strips email signatures, legal disclaimers and quoted replies from capture text.
 * The stored raw_text stays immutable; this cleaned copy feeds AI and card display.
 */
const QUOTE_START = [
  /^on .{3,200}wrote:\s*$/i,
  /^em .{3,200}escreveu:\s*$/i,
  /^-{2,}\s*(original message|mensagem original|forwarded message|mensagem encaminhada)/i,
  /^_{5,}\s*$/,
  /^(from|de):\s.+@/i,
];
const SIGNATURE_MARKER = [
  /^--\s*$/,
  /founder\s*&\s*architect/i,
  /^\*?\s*(\+351|00351)[\d\s]{6,}/,
  /^\*?\s*www\.pedrasilva\.com/i,
  /^\*?\s*find us on facebook/i,
  /^este e-?mail e quaisquer ficheiros/i,
  /^this e-?mail transmission/i,
  /^(enviado do meu|sent from my) /i,
];
const NAME_LINE = /^\*?[A-ZÀ-Ý][\p{L}.' -]{1,40}\*?$/u;

export function cleanEmailBody(text: string | null | undefined): string {
  if (!text) return "";
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let cut = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l.startsWith(">") || QUOTE_START.some((r) => r.test(l))) { cut = i; break; }
    if (SIGNATURE_MARKER.some((r) => r.test(l))) {
      cut = i;
      // Step back over a short name/title block directly above the marker.
      while (cut > 1 && NAME_LINE.test(lines[cut - 1].trim()) && !/^subject:/i.test(lines[cut - 1].trim())) cut--;
      break;
    }
  }
  return lines.slice(0, cut).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
