import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Safe markdown renderer (no raw HTML), with GFM tables. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          h1: (p) => <h1 className="mt-4 text-2xl font-semibold" {...p} />,
          h2: (p) => <h2 className="mt-4 text-xl font-semibold" {...p} />,
          h3: (p) => <h3 className="mt-3 text-lg font-semibold" {...p} />,
          ul: (p) => <ul className="list-disc space-y-1 pl-5" {...p} />,
          ol: (p) => <ol className="list-decimal space-y-1 pl-5" {...p} />,
          a: (p) => <a className="text-primary underline" target="_blank" rel="noreferrer" {...p} />,
          blockquote: (p) => <blockquote className="border-l-2 border-border pl-3 text-muted-foreground" {...p} />,
          code: (p) => <code className="rounded bg-muted px-1 py-0.5 text-xs" {...p} />,
          table: (p) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm" {...p} />
            </div>
          ),
          th: (p) => <th className="border border-border bg-muted px-2 py-1 text-left font-medium" {...p} />,
          td: (p) => <td className="border border-border px-2 py-1 align-top" {...p} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
