// Paged.js must execute in the iframe realm: passing an iframe element to a
// Previewer imported in the parent still injects styles into the parent head.
import pagedRuntime from "../../../node_modules/pagedjs/dist/paged.js?raw";

export type PagedFrameWindow = Window & {
  Paged?: { Previewer: new () => {
    preview: (content: HTMLElement, styles: Array<Record<string, string>>, target: HTMLElement) => Promise<{ total: number }>;
    chunker?: { pages?: Array<{ removeListeners: () => void }> };
  } };
};

export function installPagedFrame(frame: HTMLIFrameElement): PagedFrameWindow {
  const doc = frame.contentDocument;
  const win = frame.contentWindow as PagedFrameWindow | null;
  if (!doc || !win) throw new Error("Proposal pagination frame unavailable");
  doc.open();
  doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body><div class="proposal-paginated-preview"></div></body></html>');
  doc.close();
  const base = doc.createElement("base");
  base.href = document.baseURI;
  doc.head.appendChild(base);
  const script = doc.createElement("script");
  // CSS range-query preludes can be Raw in Paged.js' older parser.
  // Treat unsupported media as non-print instead of crashing all pagination.
  script.textContent = pagedRuntime.replaceAll('media.includes(', '(media || []).includes(');
  doc.head.appendChild(script);
  if (!win.Paged) throw new Error("Proposal pagination runtime unavailable");
  return win;
}

export function completedPagedDocument(host: HTMLElement): Document | null {
  const doc = host.querySelector<HTMLIFrameElement>("iframe")?.contentDocument;
  return host.dataset.paginationStatus === "ready" && doc?.querySelector(".pagedjs_pages") ? doc : null;
}