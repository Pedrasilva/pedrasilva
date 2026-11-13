import { parseDocument } from "htmlparser2";
import render from "dom-serializer";
import { getElementsByTagName, textContent, removeElement } from "domutils";

type HtmlElement = ReturnType<typeof getElementsByTagName>[number];
function isTag(node: HtmlElement["children"][number]): node is HtmlElement {
  return "name" in node && "attribs" in node;
}

/** Split source line breaks into paragraphs while preserving inline formatting. */
export function letterParagraphHtml(source: string, plain = false): string {
  const escaped = plain ? source.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : source;
  const document = parseDocument(escaped.replace(/\r\n?/g, "\n"));
  function lines(node: HtmlElement["children"][number]): string[] {
    if (node.type === 'text') return node.data.split('\n').map(s => render(parseDocument(s).children));
    if (!isTag(node)) return [render(node)];
    if (node.name === 'br') return ['', ''];
    const parts = [''];
    for (const child of node.children) {
      const pieces = lines(child);
      parts[parts.length - 1] += pieces[0] ?? '';
      parts.push(...pieces.slice(1));
    }
    return parts.map(part => {
      const copy = node.cloneNode(false);
      const shell = render(copy);
      return shell.replace(`</${node.name}>`, `${part}</${node.name}>`);
    });
  }
  if (plain || !getElementsByTagName('p', document.children, true).length) {
    if (plain) return normalizeProposalHtml(escaped.split('\n').filter(s => s.trim()).map(s => `<p>${s}</p>`).join(''));
  }
  for (const paragraph of getElementsByTagName('p', document.children, true)) {
    const pieces = [''];
    for (const child of paragraph.children) {
      const fragments = lines(child);
      pieces[pieces.length - 1] += fragments[0] ?? '';
      pieces.push(...fragments.slice(1));
    }
    if (pieces.length > 1) {
      const replacement = parseDocument(pieces.map(piece => `<p>${piece}</p>`).join('')).children;
      const parent = paragraph.parent;
      if (parent && 'children' in parent) {
        const index = parent.children.indexOf(paragraph);
        parent.children.splice(index, 1, ...replacement);
        replacement.forEach(node => { node.parent = parent; });
      }
    }
  }
  return normalizeProposalHtml(render(document));
}

/** Presentation only: never pass this result to an editor save or snapshot. */
export function normalizeProposalHtml(html: string): string {
  const document = parseDocument(html);
  const elements = getElementsByTagName("*", document.children, true);
  for (const element of elements) {
    if (/^h[1-6]$/.test(element.name)) {
      let previous = element.prev;
      while (previous?.type === "text" && !previous.data.trim()) previous = previous.prev;
      if (previous && isTag(previous) && /^h[1-6]$/.test(previous.name)) {
        element.attribs["data-proposal-heading-follows"] = "true";
      }
    }
    if (element.name === "p" && !textContent(element).replace(/\u00a0/g, " ").trim()
      && !getElementsByTagName((name) => ["img", "svg", "input"].includes(name), element.children, true).length
      && !Object.keys(element.attribs).some(key => key === "id" || key.startsWith("data-"))) {
      removeElement(element);
      continue;
    }
    if (element.name === "br") {
      let next = element.next;
      while (next?.type === "text" && !next.data.trim()) next = next.next;
      if (next && isTag(next) && next.name === "br") removeElement(element);
    }
    if (element.name === "p" && textContent(element).trim().endsWith(":")) {
      let next = element.next;
      while (next?.type === "text" && !next.data.trim()) next = next.next;
      if (next && isTag(next) && ["ul", "ol", "table"].includes(next.name)) {
        element.attribs["data-list-lead-in"] = "true";
      }
    }
    if (element.name !== "table") continue;
    const rows = getElementsByTagName("tr", element.children, true);
    const cells = rows.map(row => row.children.filter(isTag).filter(cell => ["td", "th"].includes(cell.name)));
    const columns = Math.max(0, ...cells.map(row => row.length));
    for (let column = 0; column < columns; column++) {
      const values = cells.map(row => row[column]).filter(cell => cell?.name === "td");
      if (values.length && values.every(cell => /^[-−+]?\s*[\d\s.,]+\s*(?:€|%|m²|m2|h|EUR)?$/i.test(textContent(cell).trim()))) {
        cells.forEach(row => { const cell = row[column]; if (cell) cell.attribs["data-proposal-numeric"] = "true"; });
      }
    }
    rows.forEach((row, index) => {
      if (/^total(?:\s|$)/i.test(textContent(cells[index]?.[0] ?? row).trim())) row.attribs["data-proposal-total"] = "true";
    });
    let next = element.next;
    while (next?.type === "text" && !next.data.trim()) next = next.next;
    if (next && isTag(next) && next.name === "p" && /^(?:áreas?\b|nota\b|notes?\b|fonte\b|source\b|approximate\b)/i.test(textContent(next).trim())) {
      element.attribs["data-proposal-has-note"] = "true";
      next.attribs["data-proposal-note"] = "true";
    }
  }
  return render(document);
}