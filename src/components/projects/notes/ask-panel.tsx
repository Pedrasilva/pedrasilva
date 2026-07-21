import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Send, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { askProjectNotes } from "@/lib/projects/notes.functions";
import { toast } from "sonner";

interface Props {
  projectId: string;
}

export function AskPanel({ projectId }: Props) {
  const { t } = useTranslation("projects");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function ask() {
    if (!question.trim()) return;
    setLoading(true);
    setAnswer(null);
    try {
      const res = await askProjectNotes({ data: { projectId, question } });
      setAnswer(res.answer);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
        <Sparkles className="h-4 w-4 text-primary" />
        {t("notes.askTitle", "Ask this project's history")}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
        className="flex gap-2"
      >
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t("notes.askPlaceholder", "e.g. What happened with the roof?")}
        />
        <Button type="submit" disabled={loading || !question.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
      {answer && (
        <div className="mt-3 whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm text-foreground">
          {answer}
        </div>
      )}
    </div>
  );
}
