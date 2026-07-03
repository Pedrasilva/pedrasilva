/**
 * TipTap-based rich text editor used by manual / library / mixed PSA blocks.
 *
 * Now used both in the right-hand settings panel AND inline on the canvas
 * (CanvaDoc-style WYSIWYG). Supports: bold, italic, underline, headings
 * (H2/H3), bullet + numbered lists, indent/outdent (list items via
 * sinkListItem/liftListItem; paragraphs/headings via a custom Indent
 * extension that persists as inline padding-left), tables, links, and
 * paragraph-spacing / line-height controls whose current value is passed in
 * from the parent (so it can be persisted on `content_rich`).
 */
import { useEditor, EditorContent, type Editor, Extension } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TextStyle } from "@tiptap/extension-text-style";
import { FontFamily } from "@tiptap/extension-font-family";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  Heading3,
  Pilcrow,
  Type,
  List,
  ListOrdered,
  Link2,
  Table as TableIcon,
  Database,
  IndentIncrease,
  IndentDecrease,
  AlignJustify,
  ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TokenCatalogEntry } from "@/lib/psa-proposal/tokens";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Custom FontSize mark stored on TextStyle. Renders as inline `font-size`.
 */
const FontSize = Extension.create({
  name: "psaFontSize",
  addOptions() {
    return { types: ["textStyle"] as string[] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element: HTMLElement) => element.style.fontSize || null,
            renderHTML: (attributes: { fontSize?: string | null }) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (size: string | null) =>
        ({ chain }: { chain: () => ReturnType<Editor["chain"]> }) => {
          if (!size) {
            return chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run();
          }
          return chain().setMark("textStyle", { fontSize: size }).run();
        },
    } as never;
  },
});

const FONT_FAMILIES: { label: string; value: string }[] = [
  { label: "Padrão", value: "" },
  { label: "Sans (Inter)", value: "Inter, system-ui, sans-serif" },
  { label: "Serif (Georgia)", value: "Georgia, 'Times New Roman', serif" },
  { label: "Mono (JetBrains)", value: "'JetBrains Mono', ui-monospace, monospace" },
  { label: "Signifier", value: "'Signifier', Georgia, serif" },
  { label: "The Future", value: "'The Future', Inter, sans-serif" },
];

const FONT_SIZES: { label: string; value: string }[] = [
  { label: "Pequeno (12)", value: "12px" },
  { label: "Normal (14)", value: "14px" },
  { label: "Médio (16)", value: "16px" },
  { label: "Grande (18)", value: "18px" },
  { label: "Título 3 (20)", value: "20px" },
  { label: "Título 2 (24)", value: "24px" },
  { label: "Título 1 (32)", value: "32px" },
];

/**
 * Paragraph / heading indent extension. Adds a numeric `indent` attribute
 * (0-8) to paragraph and heading nodes, rendered as inline `padding-left`.
 * List item indent uses StarterKit's built-in sinkListItem / liftListItem.
 */
const INDENT_STEP_EM = 1.5;
const INDENT_MAX = 8;
const Indent = Extension.create({
  name: "psaIndent",
  addOptions() {
    return { types: ["paragraph", "heading"] as string[] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element: HTMLElement) => {
              const raw = element.style.paddingLeft || "";
              const m = raw.match(/([\d.]+)em/);
              if (!m) return 0;
              return Math.round(parseFloat(m[1]) / INDENT_STEP_EM);
            },
            renderHTML: (attributes: { indent?: number }) => {
              const n = attributes.indent ?? 0;
              if (!n) return {};
              return { style: `padding-left: ${n * INDENT_STEP_EM}em` };
            },
          },
        },
      },
    ];
  },
});

function applyIndent(editor: Editor, delta: 1 | -1) {
  // Lists: use built-in sink / lift so nesting stays valid.
  if (editor.isActive("listItem")) {
    if (delta > 0) editor.chain().focus().sinkListItem("listItem").run();
    else editor.chain().focus().liftListItem("listItem").run();
    return;
  }
  const { $from } = editor.state.selection;
  // Walk up until we find a paragraph or heading node.
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === "paragraph" || node.type.name === "heading") {
      const cur = (node.attrs.indent as number | undefined) ?? 0;
      const next = Math.max(0, Math.min(INDENT_MAX, cur + delta));
      editor
        .chain()
        .focus()
        .updateAttributes(node.type.name, { indent: next })
        .run();
      return;
    }
  }
}

type Spacing = "tight" | "normal" | "relaxed" | "loose";
type LineHeight = "tight" | "normal" | "relaxed" | "loose";

const SPACING_LABEL: Record<Spacing, string> = {
  tight: "Compacto",
  normal: "Normal",
  relaxed: "Espaçado",
  loose: "Muito espaçado",
};
const LINEHEIGHT_LABEL: Record<LineHeight, string> = {
  tight: "1.2",
  normal: "1.5",
  relaxed: "1.75",
  loose: "2.0",
};

export function spacingClass(v: Spacing | undefined) {
  switch (v) {
    case "tight":
      return "[&_p]:mb-1 [&_ul]:mb-1 [&_ol]:mb-1";
    case "relaxed":
      return "[&_p]:mb-3 [&_ul]:mb-3 [&_ol]:mb-3";
    case "loose":
      return "[&_p]:mb-5 [&_ul]:mb-5 [&_ol]:mb-5";
    case "normal":
    default:
      return "[&_p]:mb-2 [&_ul]:mb-2 [&_ol]:mb-2";
  }
}

export function lineHeightClass(v: LineHeight | undefined) {
  switch (v) {
    case "tight":
      return "[&_p]:leading-tight [&_li]:leading-tight";
    case "relaxed":
      return "[&_p]:leading-loose [&_li]:leading-loose";
    case "loose":
      return "[&_p]:leading-[2] [&_li]:leading-[2]";
    case "normal":
    default:
      return "[&_p]:leading-relaxed [&_li]:leading-relaxed";
  }
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={cn(
        "rounded p-1 text-zinc-600 hover:bg-zinc-200",
        active && "bg-zinc-900 text-white hover:bg-zinc-900",
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({
  editor,
  tokenEntries,
  paragraphSpacing,
  lineHeight,
  onParagraphSpacingChange,
  onLineHeightChange,
}: {
  editor: Editor;
  tokenEntries?: TokenCatalogEntry[];
  paragraphSpacing?: Spacing;
  lineHeight?: LineHeight;
  onParagraphSpacingChange?: (v: Spacing) => void;
  onLineHeightChange?: (v: LineHeight) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-t-md border border-b-0 bg-zinc-50 px-1 py-1">
      <ToolbarButton
        title="Negrito"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Itálico"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Sublinhado"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon className="h-3.5 w-3.5" />
      </ToolbarButton>
      <div className="mx-1 h-4 w-px bg-zinc-300" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Estilo de parágrafo"
            onMouseDown={(e) => e.preventDefault()}
            className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-zinc-600 hover:bg-zinc-200"
          >
            <Pilcrow className="h-3.5 w-3.5" />
            <span>
              {editor.isActive("heading", { level: 1 })
                ? "Título 1"
                : editor.isActive("heading", { level: 2 })
                ? "Título 2"
                : editor.isActive("heading", { level: 3 })
                ? "Título 3"
                : "Corpo"}
            </span>
            <ChevronDown className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuItem
            onSelect={() => editor.chain().focus().setParagraph().run()}
            className="text-sm"
          >
            <Pilcrow className="mr-2 h-3.5 w-3.5" /> Corpo
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
            className="text-base font-bold"
          >
            <Heading1 className="mr-2 h-4 w-4" /> Título 1
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            className="text-sm font-semibold"
          >
            <Heading2 className="mr-2 h-4 w-4" /> Título 2
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
            className="text-sm font-medium"
          >
            <Heading3 className="mr-2 h-4 w-4" /> Título 3
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Tipo de letra"
            onMouseDown={(e) => e.preventDefault()}
            className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-zinc-600 hover:bg-zinc-200"
          >
            <Type className="h-3.5 w-3.5" />
            <ChevronDown className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-zinc-500">
            Tipo de letra
          </DropdownMenuLabel>
          {FONT_FAMILIES.map((f) => (
            <DropdownMenuItem
              key={f.label}
              onSelect={() => {
                if (!f.value) editor.chain().focus().unsetFontFamily().run();
                else editor.chain().focus().setFontFamily(f.value).run();
              }}
              className="text-xs"
              style={f.value ? { fontFamily: f.value } : undefined}
            >
              {f.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Tamanho"
            onMouseDown={(e) => e.preventDefault()}
            className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-zinc-600 hover:bg-zinc-200"
          >
            <span className="font-semibold">A</span>
            <ChevronDown className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-zinc-500">
            Tamanho
          </DropdownMenuLabel>
          <DropdownMenuItem
            onSelect={() => {
              (editor.chain().focus() as unknown as { setFontSize: (v: string | null) => { run: () => void } })
                .setFontSize(null)
                .run();
            }}
            className="text-xs"
          >
            Padrão
          </DropdownMenuItem>
          {FONT_SIZES.map((s) => (
            <DropdownMenuItem
              key={s.value}
              onSelect={() => {
                (editor.chain().focus() as unknown as { setFontSize: (v: string | null) => { run: () => void } })
                  .setFontSize(s.value)
                  .run();
              }}
              className="text-xs"
              style={{ fontSize: s.value }}
            >
              {s.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="mx-1 h-4 w-px bg-zinc-300" />
      <ToolbarButton
        title="Lista"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Lista numerada"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Diminuir avanço"
        onClick={() => applyIndent(editor, -1)}
      >
        <IndentDecrease className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Aumentar avanço"
        onClick={() => applyIndent(editor, 1)}
      >
        <IndentIncrease className="h-3.5 w-3.5" />
      </ToolbarButton>
      <div className="mx-1 h-4 w-px bg-zinc-300" />
      <ToolbarButton
        title="Link"
        active={editor.isActive("link")}
        onClick={() => {
          const prev = editor.getAttributes("link").href as string | undefined;
          const url = window.prompt("URL", prev ?? "https://");
          if (url === null) return;
          if (url === "") {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            return;
          }
          editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
        }}
      >
        <Link2 className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Inserir tabela"
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run()
        }
      >
        <TableIcon className="h-3.5 w-3.5" />
      </ToolbarButton>

      {(onParagraphSpacingChange || onLineHeightChange) && (
        <>
          <div className="mx-1 h-4 w-px bg-zinc-300" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="Espaçamento e entrelinha"
                onMouseDown={(e) => e.preventDefault()}
                className="flex items-center gap-1 rounded p-1 text-zinc-600 hover:bg-zinc-200"
              >
                <AlignJustify className="h-3.5 w-3.5" />
                <span className="text-[11px]">Espaçamento</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {onParagraphSpacingChange && (
                <>
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-zinc-500">
                    Entre parágrafos
                  </DropdownMenuLabel>
                  {(Object.keys(SPACING_LABEL) as Spacing[]).map((k) => (
                    <DropdownMenuItem
                      key={k}
                      onSelect={() => onParagraphSpacingChange(k)}
                      className={cn(
                        "text-xs",
                        (paragraphSpacing ?? "normal") === k && "bg-zinc-100 font-medium",
                      )}
                    >
                      {SPACING_LABEL[k]}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              {onParagraphSpacingChange && onLineHeightChange && <DropdownMenuSeparator />}
              {onLineHeightChange && (
                <>
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-zinc-500">
                    Entrelinha
                  </DropdownMenuLabel>
                  {(Object.keys(LINEHEIGHT_LABEL) as LineHeight[]).map((k) => (
                    <DropdownMenuItem
                      key={k}
                      onSelect={() => onLineHeightChange(k)}
                      className={cn(
                        "text-xs",
                        (lineHeight ?? "normal") === k && "bg-zinc-100 font-medium",
                      )}
                    >
                      {LINEHEIGHT_LABEL[k]}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}

      {tokenEntries && tokenEntries.length > 0 ? (
        <>
          <div className="mx-1 h-4 w-px bg-zinc-300" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="Inserir dado do orçamento"
                onMouseDown={(e) => e.preventDefault()}
                className="flex items-center gap-1 rounded p-1 text-zinc-600 hover:bg-zinc-200"
              >
                <Database className="h-3.5 w-3.5" />
                <span className="text-[11px]">Inserir do orçamento</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 w-72 overflow-y-auto">
              {(["Projecto", "Cliente", "Totais", "Programa", "Fases"] as const).map(
                (group) => {
                  const items = tokenEntries.filter((e) => e.group === group);
                  if (!items.length) return null;
                  return (
                    <div key={group}>
                      <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-zinc-500">
                        {group}
                      </DropdownMenuLabel>
                      {items.map((entry) => (
                        <DropdownMenuItem
                          key={entry.token}
                          onSelect={() => {
                            editor
                              .chain()
                              .focus()
                              .insertContent(`{{${entry.token}}}`)
                              .run();
                          }}
                          className="text-xs"
                        >
                          <span className="flex-1 truncate">{entry.label}</span>
                          <code className="ml-2 rounded bg-zinc-100 px-1 text-[10px] text-zinc-600">
                            {entry.token}
                          </code>
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                    </div>
                  );
                },
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ) : null}
    </div>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  tokenEntries,
  paragraphSpacing,
  lineHeight,
  onParagraphSpacingChange,
  onLineHeightChange,
  editorClassName,
  autoFocus,
}: {
  value: string;
  onChange: (next: { html: string; text: string }) => void;
  placeholder?: string;
  tokenEntries?: TokenCatalogEntry[];
  paragraphSpacing?: Spacing;
  lineHeight?: LineHeight;
  onParagraphSpacingChange?: (v: Spacing) => void;
  onLineHeightChange?: (v: LineHeight) => void;
  editorClassName?: string;
  autoFocus?: boolean;
}) {
  // Keep latest onChange in a ref so the editor instance can call the freshest
  // version without being recreated on every render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Debounced autosave: flush pending edits ~700ms after the last keystroke.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ html: string; text: string } | null>(null);

  const flush = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (pendingRef.current) {
      onChangeRef.current(pendingRef.current);
      pendingRef.current = null;
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Indent,
      TextStyle,
      FontFamily.configure({ types: ["textStyle"] }),
      FontSize,
      Link.configure({ openOnClick: false, autolink: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
    ],
    content: value || "",
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: {
        class: cn(
          "min-h-[160px] max-w-none rounded-b-md border border-input bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring",
          spacingClass(paragraphSpacing),
          lineHeightClass(lineHeight),
          editorClassName,
        ),
      },
      transformPastedHTML(html) {
        // Strip Word/Google Docs noise: inline styles, class names, MS-specific tags.
        return html
          .replace(/<!--[\s\S]*?-->/g, "")
          .replace(/<\/?(o:p|w:[a-z]+)[^>]*>/gi, "")
          .replace(/\sclass="[^"]*"/gi, "")
          .replace(/\sstyle="[^"]*"/gi, "")
          .replace(/<font[^>]*>/gi, "")
          .replace(/<\/font>/gi, "");
      },
    },
    onUpdate: ({ editor: ed }) => {
      pendingRef.current = { html: ed.getHTML(), text: ed.getText() };
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(flush, 700);
    },
    onBlur: ({ editor: ed }) => {
      pendingRef.current = { html: ed.getHTML(), text: ed.getText() };
      flush();
    },
  });

  // Flush pending content if the user navigates away or closes the tab.
  useEffect(() => {
    const handler = () => flush();
    window.addEventListener("beforeunload", handler);
    window.addEventListener("pagehide", handler);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
    return () => {
      window.removeEventListener("beforeunload", handler);
      window.removeEventListener("pagehide", handler);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes (block switch). Flush pending edits first so
  // we never overwrite unsaved content from the previous block.
  useEffect(() => {
    if (!editor) return;
    flush();
    const current = editor.getHTML();
    if (value !== current) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  // Keep the editor DOM class in sync with spacing / lineHeight changes.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    // Rebuild the class attribute rather than toggling per key — the exact
    // set of utility classes changes with each variant.
    dom.className = cn(
      "min-h-[160px] max-w-none rounded-b-md border border-input bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring",
      spacingClass(paragraphSpacing),
      lineHeightClass(lineHeight),
      editorClassName,
    );
  }, [editor, paragraphSpacing, lineHeight, editorClassName]);

  if (!editor) return null;
  return (
    <div
      className="space-y-0"
      // Stop clicks from bubbling to the canvas (which would deselect the
      // block and unmount the editor mid-edit).
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <Toolbar
        editor={editor}
        tokenEntries={tokenEntries}
        paragraphSpacing={paragraphSpacing}
        lineHeight={lineHeight}
        onParagraphSpacingChange={onParagraphSpacingChange}
        onLineHeightChange={onLineHeightChange}
      />
      <EditorContent editor={editor} data-placeholder={placeholder} />
    </div>
  );
}
