import { parseDocument } from "htmlparser2";
import render from "dom-serializer";
import { getElementsByTagName, textContent, removeElement, isTag } from "domutils";

/** Presentation only: never pass this result to an editor save or snapshot. */
export function normalizeProposalHtml(html: string): string {
  const document = parseDocument(html);
  const elements = getElementsByTagName("*", document.children, true);
  for (const element of elements) {
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