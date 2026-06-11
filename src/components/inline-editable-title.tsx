import { useState } from "react";
import { cn } from "@/lib/utils";

export function InlineEditableTitle({
  value,
  onSave,
  className,
  inputClassName,
  title = "Double-click to rename",
}: {
  value: string;
  onSave: (next: string) => Promise<unknown> | unknown;
  className?: string;
  inputClassName?: string;
  title?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  const commit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setDraft(value);
      setEditing(false);
      return;
    }
    try {
      setSaving(true);
      await onSave(trimmed);
      setEditing(false);
    } catch {
      setDraft(value);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className={cn(
          "min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-0.5 focus:border-primary focus:outline-none",
          inputClassName ?? className,
        )}
      />
    );
  }

  return (
    <h2
      onDoubleClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      title={title}
      className={cn("cursor-text", className)}
    >
      {value}
    </h2>
  );
}
