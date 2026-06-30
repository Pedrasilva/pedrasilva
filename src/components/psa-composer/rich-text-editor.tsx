/**
 * TipTap-based rich text editor used by manual / library / mixed PSA blocks.
 *
 * Supports: bold, italic, underline, headings (H2/H3), bullet + numbered lists,
 * tables, links, and forgiving paste-from-Word (StarterKit strips most Word
 * cruft; we additionally strip `class`/`style` attributes via transformPastedHTML).
 *
 * Persists HTML to `content_rich.html`. Keeps `content_rich.text` mirrored
 * (plain text) for backward compatibility with existing blocks.
 */
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Link2,
  Table as TableIcon,
  Database,
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
}: {
  editor: Editor;
  tokenEntries?: TokenCatalogEntry[];
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
      <ToolbarButton
        title="Título"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Subtítulo"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 className="h-3.5 w-3.5" />
      </ToolbarButton>
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
}: {
  value: string;
  onChange: (next: { html: string; text: string }) => void;
  placeholder?: string;
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
      Link.configure({ openOnClick: false, autolink: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class:
          "min-h-[160px] max-w-none rounded-b-md border border-input bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring",
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

  if (!editor) return null;
  return (
    <div className="space-y-0">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} data-placeholder={placeholder} />
    </div>
  );
}
