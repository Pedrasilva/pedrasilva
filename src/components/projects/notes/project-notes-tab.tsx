import { NoteComposer } from "./note-composer";
import { NotesList } from "./notes-list";
import { AskPanel } from "./ask-panel";

interface Props {
  projectId: string;
}

export function ProjectNotesTab({ projectId }: Props) {
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <NoteComposer projectId={projectId} />
        <NotesList projectId={projectId} />
      </div>
      <div className="space-y-4">
        <AskPanel projectId={projectId} />
      </div>
    </div>
  );
}
