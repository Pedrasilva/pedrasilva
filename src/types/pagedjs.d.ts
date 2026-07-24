declare module "pagedjs" {
  export class Previewer {
    preview(
      content: HTMLElement | DocumentFragment | string,
      stylesheets?: Array<string | Record<string, string>>,
      renderTo?: HTMLElement,
    ): Promise<{ total: number; pages: unknown[] }>;
  }
}