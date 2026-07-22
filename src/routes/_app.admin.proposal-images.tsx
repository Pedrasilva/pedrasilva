import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";
import { toast } from "sonner";
import { AdminOnly } from "@/components/AdminOnly";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Upload } from "lucide-react";
import {
  useProposalImages,
  useUploadProposalImage,
  useDeleteProposalImage,
  useSignedProposalImageUrl,
  type PsaImageLibraryEntry,
} from "@/lib/psa-proposal/use-proposal-images";

export const Route = createFileRoute("/_app/admin/proposal-images")({
  component: ProposalImagesAdminPage,
});

function ProposalImagesAdminPage() {
  return (
    <AdminOnly>
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Biblioteca de Imagens (Propostas)</h1>
          <p className="text-sm text-muted-foreground">
            Imagens partilhadas usadas para preencher espaços em branco no PDF das propostas.
          </p>
        </div>
        <ImagesPanel />
      </div>
    </AdminOnly>
  );
}

function ImagesPanel() {
  const images = useProposalImages();
  const upload = useUploadProposalImage();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    for (const f of Array.from(files)) {
      try {
        await upload.mutateAsync({ file: f });
      } catch (e) {
        toast.error(`Falha ao carregar ${f.name}: ${(e as Error).message}`);
      }
    }
    toast.success("Imagens carregadas");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Imagens ({images.data?.length ?? 0})</CardTitle>
        <div>
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
            <Upload className="mr-2 h-4 w-4" />
            {upload.isPending ? "A carregar..." : "Carregar imagens"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      </CardHeader>
      <CardContent>
        {!images.data?.length ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Biblioteca vazia. Carregue as primeiras imagens.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {images.data.map((img) => (
              <ImageCard key={img.id} entry={img} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ImageCard({ entry }: { entry: PsaImageLibraryEntry }) {
  const signed = useSignedProposalImageUrl(entry.storage_path, entry.bucket);
  const del = useDeleteProposalImage();
  return (
    <div className="group relative overflow-hidden rounded border">
      {signed.data ? (
        <img src={signed.data} alt={entry.name} className="h-36 w-full object-cover" />
      ) : (
        <div className="h-36 w-full bg-zinc-100" />
      )}
      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
        <div className="min-w-0 truncate text-xs font-medium">{entry.name}</div>
        <button
          type="button"
          className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600"
          title="Eliminar"
          onClick={() => {
            if (confirm(`Eliminar "${entry.name}"?`)) {
              del.mutate(entry, {
                onSuccess: () => toast.success("Imagem removida"),
                onError: (e) => toast.error((e as Error).message),
              });
            }
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
