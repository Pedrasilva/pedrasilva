/** Browser-side text extraction for press kits (.pdf via pdfjs-dist, .docx via the built-in zip inflater). */

export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    pages.push((tc.items as Array<{ str?: string; hasEOL?: boolean }>).map((it) => (it.str ?? "") + (it.hasEOL ? "\n" : "")).join(""));
  }
  return pages.join("\n\n").replace(/[ \t]+\n/g, "\n").trim();
}

/** Reads word/document.xml out of a .docx (zip) and returns its paragraphs as plain text. */
export async function extractDocxText(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer);
  // End of central directory
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("not a zip");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name !== "word/document.xml") continue;
    const lStart = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const data = buf.subarray(lStart, lStart + csize);
    let xmlBytes: Uint8Array;
    if (method === 0) xmlBytes = data;
    else if (method === 8) {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      xmlBytes = new Uint8Array(await new Response(stream).arrayBuffer());
    } else throw new Error("unsupported compression");
    const xml = dec.decode(xmlBytes);
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    const paras = Array.from(doc.getElementsByTagNameNS(W, "p")).map((para) =>
      Array.from(para.getElementsByTagNameNS(W, "t")).map((t) => t.textContent ?? "").join(""));
    return paras.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  throw new Error("no document text");
}
