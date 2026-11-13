import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { REPAGINATION_DELAY_MS } from "@/lib/psa-proposal/page-layout";
import { resolveMaster, pageVariant, masterVariables, type MasterPage, typeLayout } from '@/lib/psa-proposal/master-page';
import { installPagedFrame } from "@/lib/psa-proposal/paged-frame";
import { prepareExplicitPageBreaks } from "@/lib/psa-proposal/explicit-page-breaks";
import { normalizeProposalHtml } from "@/lib/psa-proposal/document-rhythm";

const inlinedImages = new Map<string, Promise<string>>();
function inlineImage(url: string): Promise<string> {
  if (url.startsWith("data:")) return Promise.resolve(url);
  let pending = inlinedImages.get(url);
  if (!pending) {
    pending = fetch(url)
      .then((response) => (response.ok ? response.blob() : Promise.reject(new Error("image"))))
      .then((blob) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      }))
      .catch(() => { inlinedImages.delete(url); return url; });
    inlinedImages.set(url, pending);
  }
  return pending;
}

let paginationQueue: Promise<void> = Promise.resolve();
type PagedListeners = { chunker?: { pages?: Array<{ removeListeners: () => void }> } };

function collectDocumentStyles(source: HTMLDivElement, furniture: { header: boolean; footer: boolean }, typedMaster?: MasterPage): Array<Record<string, string>> {
  const styles: Array<Record<string, string>> = [];

  for (const sheet of Array.from(document.styleSheets)) {
    const owner = sheet.ownerNode;
    if (
      owner instanceof HTMLElement &&
      (owner.hasAttribute("data-pagedjs-inserted-styles") ||
        owner.hasAttribute("data-pagedjs-ignore"))
    ) {
      continue;
    }
    try {
      const css = Array.from(sheet.cssRules).map((rule) => rule.cssText.replace(/@media\s*\(/g, "@media all and (")).join("\n");
      if (css) styles.push({ [sheet.href ?? window.location.href]: css });
    } catch {
      // Cross-origin stylesheets cannot be read. The proposal's layout CSS is
      // emitted by Vite on the current origin and remains available here.
    }
  }

  // Keep the proposal page contract last so older feature-specific @page
  // rules cannot make Paged.js fall back to its default US Letter sheet.
  const computed = window.getComputedStyle(source);
  const top = computed.getPropertyValue("--psa-margin-top").trim() || "34mm";
  const right = computed.getPropertyValue("--psa-margin-right").trim() || "14mm";
  const bottom = computed.getPropertyValue("--psa-margin-bottom").trim() || "32mm";
  const left = computed.getPropertyValue("--psa-margin-left").trim() || "14mm";
  styles.push({
    "proposal-a4.css": `
      @page {
        size: A4;
        margin: ${top} ${right} ${bottom} ${left};
        @top-center { content: ${furniture.header ? '""' : "none"}; width: 100%; }
        @bottom-left { content: ${furniture.footer ? '""' : "none"}; }
        @bottom-right { content: ${furniture.footer ? 'counter(page) " / " counter(pages)' : "none"}; }

      }
      .proposal-paged-source,
      .proposal-paged-content { page: proposal-document; }
      .proposal-paged-content { display: flow-root; }
      .proposal-paged-content .proposal-print-block { border: 0 !important; border-radius: 0 !important; box-shadow: none !important; }
      .proposal-paged-content [data-visible-print="false"] { display: none !important; }
      /* Keep headings, not a chain of entire multi-page sections. */
      .proposal-paged-content h1,
      .proposal-paged-content h2,
      .proposal-paged-content h3,
      .proposal-paged-content h4,
      .proposal-paged-content h5,
      .proposal-paged-content h6,
      .proposal-paged-content [data-list-lead-in="true"] { break-after: avoid; }
      .proposal-paged-content [data-page-type="content"] li,
      .proposal-paged-content [data-page-type="content"] ul,
      .proposal-paged-content [data-page-type="content"] ol,
      .proposal-paged-content [data-page-type="content"] .psa-rich {
        break-inside: auto; page-break-inside: auto; orphans: 2; widows: 2;
      }
      .proposal-paged-content thead { display: table-header-group; }
      .proposal-paged-content tbody tr { break-inside: avoid; }
      .proposal-paged-source { width: auto !important; max-width: none !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; }

      .proposal-paged-content p {
        break-inside: auto;
        orphans: 2;
        widows: 2;
      }
      .proposal-paged-content .proposal-avoid-break,
      .proposal-paged-content .proposal-phase-summary-card {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .proposal-paged-content [data-proposal-block-type="index"] {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }
      .proposal-paged-content .proposal-page-break-before {
        break-before: page;
      }
      .proposal-paged-content .proposal-page-break-after {
        break-after: page;
      }
      .proposal-paged-content .proposal-print-block[data-first-printable="true"],
      .proposal-paged-content > div > .proposal-print-block:first-child {
        break-before: auto !important;
      }
      .proposal-paged-content .proposal-appendix {
        break-before: auto;
      }
      /* The rotated Gantt sheet must stay atomic: a transformed, absolutely
         positioned subtree cannot be fragmented without corrupting paint. */
      .proposal-paged-content .proposal-print-block-gantt-landscape,
      .proposal-paged-content .proposal-appendix-landscape,
      .proposal-paged-content .proposal-gantt-rotate-outer {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .proposal-paged-content .proposal-print-block-gantt-landscape {
        break-before: page;
      }
      @page psa-gantt { size: A4 landscape; margin: ${top} ${right} ${bottom} ${left}; }
      .pagedjs_psa-gantt_page {
        --pagedjs-width: 297mm !important; --pagedjs-height: 210mm !important;
        --pagedjs-width-right: 297mm !important; --pagedjs-height-right: 210mm !important;
        --pagedjs-width-left: 297mm !important; --pagedjs-height-left: 210mm !important;
        --pagedjs-pagebox-width: 297mm !important; --pagedjs-pagebox-height: 210mm !important;
      }
      .proposal-paged-content .proposal-document-gantt-block {
        page: psa-gantt; break-before: page; break-after: page;
        break-inside: avoid; width: ${297 - parseFloat(left) - parseFloat(right)}mm !important;
        margin: 0 !important; padding: 0 !important;
      }
      .proposal-paged-content .proposal-document-gantt-sheet {
        width: 100% !important; max-width: none !important; break-inside: avoid;
      }
      .proposal-paged-content .proposal-document-gantt-table { font-size: 9pt !important; }
      .proposal-paged-content .proposal-document-gantt-table th,
      .proposal-paged-content .proposal-document-gantt-table td { font-size: 9pt !important; }
      .proposal-paged-content .proposal-document-gantt-table thead { display: table-header-group !important; }

    `,
  });

  if (typedMaster) {
    const cover=typeLayout(typedMaster,'cover'),letter=typeLayout(typedMaster,'letter');
    const margin=(m:typeof letter.margins)=>`${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm`;
    styles.push({'page-types.css':`
      @page psa-cover {size:A4;margin:${margin(cover.margins)};@top-center{content:none}@bottom-left{content:none}@bottom-right{content:none}}
      @page psa-letter {size:A4;margin:${margin(letter.margins)};@top-center{content:"";width:100%}@bottom-left{content:""}@bottom-right{content:none}}
      [data-page-type="cover"]{page:psa-cover;break-before:page;break-after:page}
      [data-page-type="letter"]{page:psa-letter;break-before:page;break-after:page}
      [data-page-type="cover"] .proposal-cover{min-height:${297-cover.margins.top-cover.margins.bottom}mm;box-sizing:border-box;padding-top:${cover.bodyY}mm}
    `});
  }
  return styles;
}

export function PaginatedPreview({
  source,
  dataReady = true,
  invalidateKey,
  selectedId,
  onSelect,
  onStatusChange,
}: {
  source: HTMLDivElement | null;
  dataReady?: boolean;
  invalidateKey: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStatusChange?: (status: "loading" | "ready" | "error") => void;
}) {
  const targetRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const { t } = useTranslation("common");

  useEffect(() => {
    const target = targetRef.current;
    if (!source || !target) return;

    let cancelled = false;
    setStatus("loading");
    onStatusChange?.("loading");
    target.dataset.paginationStatus = "loading";
    if (!dataReady || source.querySelector('[data-live-ready="false"]')) return;

    const render = async () => {
      let frame: HTMLIFrameElement | null = null;
      let releasePages = () => {};
      try {
        await document.fonts?.ready;
        const sourceImages = Array.from(source.querySelectorAll<HTMLImageElement>("img"));
        await Promise.all(
          sourceImages.map(async (image) => {
            if (image.complete) return;
            try {
              await image.decode();
            } catch {
              // A failed decorative image must not prevent document pagination.
            }
          }),
        );
        if (cancelled) return;

        const masterNode = source.matches('[data-master-page]') ? source : source.querySelector<HTMLElement>('[data-master-page]');
        const master: MasterPage = masterNode?.dataset.masterPage ? JSON.parse(masterNode.dataset.masterPage) : resolveMaster();
        const clone = source.cloneNode(true) as HTMLDivElement;
        clone.innerHTML = normalizeProposalHtml(clone.innerHTML);
        const letterFooters=new Map<string,HTMLElement>();
        clone.querySelectorAll<HTMLElement>('.psa-letter-footer').forEach(footer=>{
          const id=footer.closest<HTMLElement>('[data-proposal-block-id]')?.dataset.proposalBlockId;
          if(id)letterFooters.set(id,footer.cloneNode(true) as HTMLElement);
          footer.remove();
        });
        clone.removeAttribute("id");
        // Never copy the hidden source state into Paged.js. The clone must be
        // ordinary document flow before the fragmentation engine measures it.
        clone.classList.remove("proposal-pagination-source", "proposal-preview-source");
        // Render-only normalization: never write legacy alignment back to data.
        clone.querySelectorAll<HTMLElement>('[data-page-type="content"]').forEach(block => {
          block.removeAttribute('data-page-aligned');
          block.removeAttribute('data-page-align-y');
          block.removeAttribute('data-page-align-x');
        });
        clone.querySelectorAll<HTMLElement>('p').forEach(paragraph => {
          if (paragraph.nextElementSibling?.matches('ul,ol')) paragraph.dataset.listLeadIn='true';
        });
        clone.querySelectorAll(
          '[data-editor-toolbar="true"], button, .print\\:hidden, [contenteditable="true"] .ProseMirror-menu',
        ).forEach((node) => node.remove());
        clone.querySelectorAll<HTMLElement>("[contenteditable]").forEach((node) => {
          node.removeAttribute("contenteditable");
        });
        prepareExplicitPageBreaks(clone);
        // One normal-flow landscape block per chart sheet; no rotated duplicate
        // or transformed subtree is passed to the fragmentation engine.
        clone.querySelectorAll<HTMLElement>('[data-proposal-block-id]').forEach(block => {
          const sheets=Array.from(block.querySelectorAll<HTMLElement>('[data-gantt-sheet]'));
          if (!sheets.length || block.dataset.visiblePrint==='false') return;
          for (const sheet of sheets) {
            const wrapper=block.cloneNode(false) as HTMLElement;
            wrapper.className='proposal-print-block proposal-document-gantt-block';
            wrapper.removeAttribute('style');
            wrapper.removeAttribute('data-page-aligned');
            wrapper.removeAttribute('data-page-align-x');
            wrapper.removeAttribute('data-page-align-y');
            wrapper.dataset.pageType='content';
            wrapper.dataset.explicitPageBreakBefore='true';
            wrapper.dataset.keepWithNext='false';
            wrapper.appendChild(sheet);
            block.before(wrapper);
          }
          block.remove();
        });
        const firstPrintable = clone.querySelector<HTMLElement>(
          '.proposal-print-block[data-first-printable="true"]',
        );
        if (firstPrintable) {
          firstPrintable.style.setProperty("break-before", "auto", "important");
          firstPrintable.style.setProperty("page-break-before", "auto", "important");
        }
        // Furniture lives in generated margin boxes, outside fragmented block flow.
        const runningElements = Array.from(
          clone.querySelectorAll<HTMLElement>(".proposal-page-header, .proposal-page-footer"),
        );
        runningElements.forEach((element) => element.remove());
        // Inline the letterhead image so every sheet and the print window paint
        // it immediately, without waiting for a network fetch per page.
        await Promise.all(runningElements.flatMap((element) => Array.from(element.querySelectorAll("img")).map(async (image) => {
          const url = new URL(image.getAttribute("src") ?? "", document.baseURI).href;
          image.setAttribute("src", await inlineImage(url));
          image.loading = "eager";
          image.decoding = "sync";
        })));
        if (cancelled) return;

        const printRoot = document.createElement("div");
        printRoot.className = "proposal-print-area proposal-print-document proposal-paged-source";
        printRoot.lang = source.lang || "pt-PT";
        printRoot.setAttribute("style", (masterNode ?? source).getAttribute("style") ?? "");
        Object.entries(masterVariables(master)).forEach(([key,value]) => printRoot.style.setProperty(key,value));
        const content = document.createElement("div");
        content.className = "proposal-paged-content";
        while (clone.firstChild) content.appendChild(clone.firstChild);
        printRoot.appendChild(content);

        frame = document.createElement("iframe");
        frame.title = t("proposalComposer.pagination.pages");
        frame.className = "proposal-pagination-frame";
        target.replaceChildren(frame);
        const frameWindow = installPagedFrame(frame);
        const frameDoc = frame.contentDocument;
        if (!frameDoc || !frameWindow.Paged) throw new Error("Pagination frame unavailable");
        frameDoc.documentElement.lang = printRoot.lang;
        const frameTarget = frameDoc.querySelector<HTMLElement>(".proposal-paginated-preview");
        if (!frameTarget) throw new Error("Pagination target unavailable");
        const typed = !!masterNode?.dataset.pageTypesEnabled || !!source.querySelector('.psa-letter-page');
        const styles = collectDocumentStyles(source, {
          header: runningElements.some((element) => element.classList.contains("proposal-page-header")),
          footer: runningElements.some((element) => element.classList.contains("proposal-page-footer")),
        }, typed ? master : undefined);
        for (const entry of styles) {
          const style = frameDoc.createElement("style");
          style.textContent = Object.values(entry).join("\n");
          frameDoc.head.appendChild(style);
        }
        await frameDoc.fonts?.ready;
        const previewer = new frameWindow.Paged.Previewer();
        const pagedInternals = previewer as unknown as PagedListeners;
        releasePages = () => pagedInternals.chunker?.pages?.forEach((page) => page.removeListeners());
        // Render away from React's live target. In development/fast toggles an
        // effect cleanup can otherwise remove Paged.js' current page while its
        // async layout is still measuring it, causing the one-page/null crash.
        const staging = frameDoc.createElement("div");
        staging.className = "proposal-pagination-staging";
        frameDoc.body.appendChild(staging);
        const result = await previewer.preview(frameDoc.importNode(printRoot, true), styles, staging);
        if (cancelled) return;
        // Paged.js keeps a ResizeObserver on every generated sheet. Moving the
        // completed sheets out of the staging container otherwise triggers an
        // underflow pass against detached nodes (`findElement(null)`), which
        // can collapse the visible result back to its first page.
        releasePages();
        const pageBoxes = staging.querySelectorAll<HTMLElement>(".pagedjs_pagebox");
        pageBoxes.forEach((pageBox, index) => {
          pageBox.classList.add("proposal-print-document", "proposal-generated-pagebox");
          pageBox.classList.add('proposal-master-document');
          pageBox.setAttribute("style", (masterNode ?? source).getAttribute("style") ?? "");
          const type = typed ? (pageBox.querySelector('[data-page-type]')?.getAttribute('data-page-type') ?? 'content') : 'content';
          if(type==='letter'){
            const id=pageBox.querySelector<HTMLElement>('[data-proposal-block-id]')?.dataset.proposalBlockId;
            const footer=id?letterFooters.get(id):undefined;
            if(footer){const placed=frameDoc.importNode(footer,true);placed.classList.add('psa-letter-page-footer');pageBox.appendChild(placed);}
          }
          pageBox.closest<HTMLElement>('.pagedjs_page')?.setAttribute('data-page-type',type);
          const variant = type==='letter' ? master : type==='content' ? pageVariant(master, !typed && index === 0) : {...master,header:{...master.header,show:false},footer:{...master.footer,show:false}};
          const landscape=!!pageBox.querySelector('[data-gantt-sheet]');
          pageBox.closest<HTMLElement>('.pagedjs_page')?.setAttribute('data-orientation',landscape?'landscape':'portrait');
          const adapted=landscape?{...variant,logo:{...variant.logo,x:variant.logo.x+(variant.logo.alignment==='right'?87:variant.logo.alignment==='centre'?43.5:0)},contact:{...variant.contact,x:variant.contact.x+87}}:variant;
          Object.entries(masterVariables(adapted)).forEach(([key,value]) => pageBox.style.setProperty(key,value));
          pageBox.style.setProperty('--psa-page-width',landscape?'297mm':'210mm');
          pageBox.dataset.headerHidden = String(!variant.header.show);
          pageBox.dataset.footerHidden = String(!variant.footer.show);
          runningElements.forEach((element) => {
            if (typed && type === "cover") return;
            const selector = element.classList.contains("proposal-page-header")
              ? ".pagedjs_margin-top-center .pagedjs_margin-content"
              : ".pagedjs_margin-bottom-left .pagedjs_margin-content";
            const margin = pageBox.querySelector<HTMLElement>(selector);
            if (margin) {
              margin.classList.add("proposal-margin-furniture");
              const furnitureClone = element.cloneNode(true) as HTMLElement;
              furnitureClone.removeAttribute('data-first-hidden');
              if (type === 'letter' && element.classList.contains('proposal-page-header')) {
                const contact = furnitureClone.querySelector('.proposal-letterhead-contact');
                if (contact) {
                  contact.replaceChildren(...master.footer.address.split('\n').map(line => {
                    const row = frameDoc.createElement('div'); row.textContent = line; return row;
                  }));
                }
              }
              margin.appendChild(furnitureClone);
            }
          });
          pageBox.closest<HTMLElement>(".pagedjs_page")?.setAttribute(
            "data-page-number",
            String(index + 1),
          );
        });
        if (result.total !== pageBoxes.length || pageBoxes.length === 0) {
          throw new Error("Pagination produced an incomplete page set");
        }
        // Commit a snapshot instead of moving Paged.js' observed live nodes.
        // Moving those nodes can trigger a late underflow/layout pass which
        // removes every generated sheet after page one.
        const completedPages = staging.querySelector<HTMLElement>(".pagedjs_pages");
        if (!completedPages) {
          throw new Error("Pagination did not produce a page container");
        }
        frameTarget.replaceChildren(completedPages.cloneNode(true));
        staging.remove();
        // Letters fragment normally; a second page is not an export error.
        const letterOverflow=false;
        const reset = frameDoc.createElement("style");
        const rootStyle = getComputedStyle(document.documentElement);
        const sheetGap = rootStyle.getPropertyValue("--muted").trim() || "#e5e5e5";
        const sheetEdge = rootStyle.getPropertyValue("--border").trim() || "#d4d4d4";
        const labelInk = rootStyle.getPropertyValue("--muted-foreground").trim() || "#737373";
        const pages=Array.from(frameTarget.querySelectorAll<HTMLElement>('.pagedjs_page'));
        const contentTotal=typed?pages.filter(p=>p.dataset.pageType==='content').length:result.total;
        let contentNumber=0;
        const anchorPages=new Map<string,number>();
        pages.forEach(page=>{if(!typed||page.dataset.pageType==='content'){contentNumber++;page.dataset.contentNumber=String(contentNumber);page.querySelectorAll<HTMLElement>('[id]').forEach(n=>anchorPages.set(n.id,contentNumber));}});
        pages.forEach((page) => {
          page.setAttribute("data-page-label", `${page.dataset.contentNumber ?? page.dataset.pageType ?? ""}${page.dataset.contentNumber ? ` / ${contentTotal}` : ""}`);
          const footerNumber = page.querySelector<HTMLElement>(".pagedjs_margin-bottom-right .pagedjs_margin-content");
          if (footerNumber && runningElements.some((element) => element.classList.contains("proposal-page-footer"))) {
            if (page.dataset.contentNumber) {
              footerNumber.setAttribute("data-footer-page", `${page.dataset.contentNumber} / ${contentTotal}`);
            } else {
              footerNumber.removeAttribute("data-footer-page");
              footerNumber.replaceChildren();
            }
          }
        });
        frameTarget.querySelectorAll<HTMLAnchorElement>('.proposal-toc-link').forEach(a=>{const n=anchorPages.get(a.hash.slice(1));if(n){const label=frameDoc.createElement('span');label.textContent=String(n);label.className='proposal-toc-page';a.appendChild(label);}});
        reset.textContent = `
          html,body{margin:0!important;padding:0!important;width:297mm!important;overflow:hidden!important}
          .proposal-paginated-preview{display:block!important}
          /* Running header/footer: fixed position inside the page margins on every sheet (screen and print). */
          .proposal-paginated-preview .pagedjs_margin-top{display:block!important;position:relative!important}
          .proposal-paginated-preview .pagedjs_margin-top-left,.proposal-paginated-preview .pagedjs_margin-top-right{display:none!important}
          .proposal-paginated-preview .pagedjs_margin-top-center{display:block!important;position:absolute!important;left:0!important;right:0!important;top:var(--psa-header-top,8mm)!important;height:auto!important;width:auto!important}
          .proposal-paginated-preview .pagedjs_margin-top-center > .pagedjs_margin-content{display:block!important;width:100%!important;text-align:left!important}
          .proposal-margin-furniture .proposal-page-header{display:flex!important;flex-direction:row!important;flex-wrap:nowrap!important;justify-content:space-between!important;align-items:flex-start!important;width:100%!important;text-align:left!important;position:static!important;margin:0!important}
          .proposal-margin-furniture .proposal-letterhead-brand{align-items:flex-start!important;margin:0!important}
          .proposal-margin-furniture .proposal-letterhead-contact{text-align:right!important;margin-left:auto!important}
          .proposal-paginated-preview .pagedjs_margin-bottom{display:block!important;position:relative!important}
          .proposal-paginated-preview .pagedjs_margin-bottom-center{display:none!important}
          .proposal-paginated-preview .pagedjs_margin-bottom-left,.proposal-paginated-preview .pagedjs_margin-bottom-right{display:block!important;position:absolute!important;bottom:var(--psa-footer-bottom,6mm)!important;top:auto!important;height:auto!important;width:auto!important}
          .proposal-paginated-preview .pagedjs_margin-bottom-left{left:0!important;right:30mm!important}
          .proposal-paginated-preview .pagedjs_margin-bottom-right{right:0!important;left:auto!important;text-align:right!important}
          .proposal-paginated-preview .pagedjs_margin-bottom-left > .pagedjs_margin-content,.proposal-paginated-preview .pagedjs_margin-bottom-right > .pagedjs_margin-content{display:block!important;width:100%!important;height:auto!important}
          .proposal-paginated-preview .pagedjs_margin-bottom-right > .pagedjs_margin-content::after{content:attr(data-footer-page)!important;font-family:var(--psa-heading-font);font-size:8pt;color:#111}
          .proposal-paginated-preview .pagedjs_margin-bottom-right,.proposal-paginated-preview .pagedjs_margin-bottom-right *{font-size:8pt;font-family:var(--psa-heading-font);color:#111;line-height:1.2}
          .proposal-margin-furniture .proposal-page-footer{position:static!important;margin:0!important;display:block!important}
          /* Master geometry is page-edge based, not margin-box-edge based. */
          .proposal-master-document .pagedjs_margin-top {position:static!important}
          .proposal-master-document .pagedjs_margin-top-center {left:0!important;right:0!important;top:0!important;bottom:auto!important;width:var(--psa-page-width,210mm)!important;height:var(--psa-header-height)!important}
          .proposal-master-document .proposal-margin-furniture .proposal-page-header {position:relative!important;left:0!important;right:auto!important;top:0!important;width:var(--psa-page-width,210mm)!important;height:var(--psa-header-height)!important;display:block!important}
          .proposal-master-document .proposal-letterhead-brand {position:absolute!important;left:var(--psa-logo-x)!important;top:var(--psa-logo-y)!important;transform:var(--psa-logo-transform)!important}
          .proposal-master-document .proposal-letterhead-logo {width:var(--psa-logo-width)!important;height:var(--psa-logo-height)!important;max-width:none!important}
          .proposal-master-document .proposal-letterhead-contact {position:absolute!important;left:var(--psa-contact-x)!important;top:var(--psa-contact-y)!important;width:var(--psa-contact-width)!important;margin:0!important}
          .proposal-master-document .pagedjs_margin-bottom {position:static!important}
          .proposal-master-document .pagedjs_margin-bottom-left {left:14mm!important;right:44mm!important;bottom:6mm!important}
          .proposal-master-document .pagedjs_margin-bottom-right {right:14mm!important;bottom:6mm!important}
          .proposal-master-document .proposal-page-footer,.proposal-master-document .pagedjs_margin-bottom-right,.proposal-master-document .pagedjs_margin-bottom-right *,.proposal-master-document .pagedjs_margin-bottom-right > .pagedjs_margin-content::after {font-size:var(--psa-footer-size)!important}
          .proposal-master-document[data-header-hidden="true"] .pagedjs_margin-top-center,.proposal-master-document[data-footer-hidden="true"] .pagedjs_margin-bottom-left,.proposal-master-document[data-footer-hidden="true"] .pagedjs_margin-bottom-right {visibility:hidden!important}
          /* Screen-only sheet presentation; print never sees these rules. */
          @media screen{
            html,body{background:${sheetGap}!important}
            .proposal-paginated-preview .pagedjs_pages{display:flex!important;flex-direction:column!important;align-items:center!important;gap:24px!important;padding:12px 0 24px!important}
            .proposal-paginated-preview .pagedjs_page{position:relative!important;margin:0!important;background:#fff;box-shadow:0 0 0 1px ${sheetEdge},0 2px 8px rgba(0,0,0,.12)!important}
            .proposal-paginated-preview .pagedjs_page::before{content:attr(data-page-label);position:absolute;left:0;right:0;bottom:-18px;text-align:center;font:500 10px/1 system-ui,sans-serif;color:${labelInk};pointer-events:none}
          }`;
        frameDoc.head.appendChild(reset);
        frame.style.width = '297mm';
        frame.style.height = `${frameTarget.scrollHeight}px`;
        frameDoc.addEventListener("click", (event) => {
          const element = event.target as HTMLElement;
          const id = element.closest<HTMLElement>("[data-proposal-block-id]")?.dataset.proposalBlockId;
          if (id) onSelect(id);
        });
        target.dataset.pageCount = String(result.total);
        target.dataset.letterOverflow=String(letterOverflow);
        target.dataset.paginationStatus=letterOverflow?'error':'ready';
        setStatus(letterOverflow?"error":"ready");
        onStatusChange?.(letterOverflow?"error":"ready");
      } catch (error) {
        if (cancelled) return;
        console.error("Proposal pagination failed", error);
        // Paged.js may leave one incomplete sheet in the target before it
        // throws. Never present that fragment as if it were the document.
        target.replaceChildren();
        setStatus("error");
        onStatusChange?.("error");
      } finally {
        releasePages();
        if (cancelled) frame?.remove();
      }
    };

    const timer = window.setTimeout(() => { paginationQueue = paginationQueue.then(async () => { if (!cancelled) await render(); }).catch(() => {}); }, REPAGINATION_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [source, dataReady, invalidateKey, onStatusChange]);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;
    const frameDoc = target.querySelector<HTMLIFrameElement>("iframe")?.contentDocument;
    frameDoc?.querySelectorAll<HTMLElement>("[data-proposal-block-id]").forEach((fragment) => {
      fragment.classList.toggle(
        "proposal-paged-block-selected",
        fragment.dataset.proposalBlockId === selectedId,
      );
    });
    if (selectedId) {
      const fragment = Array.from(frameDoc?.querySelectorAll<HTMLElement>("[data-proposal-block-id]") ?? []).find((node) => node.dataset.proposalBlockId === selectedId);
      fragment?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [selectedId, status]);

  return (
    <div className="proposal-paginated-stage">
      {status === "loading" && (
        <div className="proposal-pagination-status" role="status">
          {t("proposalComposer.pagination.loading")}
        </div>
      )}
      {status === "error" && (
        <div className="proposal-pagination-status proposal-pagination-status-error" role="alert">
          {t(targetRef.current?.dataset.letterOverflow==='true'?"letter.overflow":"proposalComposer.pagination.error")}
        </div>
      )}
      <div
        ref={targetRef}
        className="proposal-paginated-preview"
        data-pagination-status={status}
        aria-live="polite"
        onClick={(event) => {
          const element = event.target as HTMLElement;
          const fragment = element.closest<HTMLElement>("[data-proposal-block-id]");
          const id = fragment?.dataset.proposalBlockId;
          if (id) onSelect(id);
        }}
      />
    </div>
  );
}