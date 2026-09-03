/**
 * Product Library data layer.
 *
 * Two objects, one rule: a Project Item is a SNAPSHOT. Adding a Library
 * Product to a project copies its reusable fields; afterwards the two records
 * evolve independently. Nothing here ever writes back to the library except
 * the explicit `useUpdateLibraryFromItem` action.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  PRODUCT_IMAGE_BUCKET,
  type LibraryProduct,
  type ProductCategory,
  isPdfPath,
  type ProjectItem,
} from "./types";

// The generated Supabase types lag behind new tables; cast once here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const KEY = ["product-library"] as const;

/* ───────────────────────────── categories ───────────────────────────── */

export function useProductCategories() {
  return useQuery({
    queryKey: [...KEY, "categories"],
    queryFn: async (): Promise<ProductCategory[]> => {
      const { data, error } = await sb
        .from("product_categories")
        .select("id, parent_id, name, sort_order, active")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as ProductCategory[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useSaveCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ProductCategory> & { name: string }) => {
      if (input.id) {
        const { error } = await sb.from("product_categories").update(input).eq("id", input.id);
        if (error) throw error;
        return input.id;
      }
      const { data, error } = await sb
        .from("product_categories")
        .insert(input)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, "categories"] }),
  });
}

/* ────────────────────────── library products ────────────────────────── */

export function useLibraryProducts() {
  return useQuery({
    queryKey: [...KEY, "products"],
    queryFn: async (): Promise<LibraryProduct[]> => {
      const { data, error } = await sb
        .from("library_products")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LibraryProduct[];
    },
  });
}

export type LibraryProductInput = Partial<Omit<LibraryProduct, "id">> & { name: string };

export function useSaveLibraryProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LibraryProductInput & { id?: string }): Promise<LibraryProduct> => {
      const { id, ...rest } = input;
      if (id) {
        const { data, error } = await sb
          .from("library_products")
          .update(rest)
          .eq("id", id)
          .select("*")
          .single();
        if (error) throw error;
        return data as LibraryProduct;
      }
      const { data, error } = await sb
        .from("library_products")
        .insert(rest)
        .select("*")
        .single();
      if (error) throw error;
      return data as LibraryProduct;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, "products"] }),
  });
}

export function useSetLibraryProductStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; status: "current" | "archived" }) => {
      const { error } = await sb
        .from("library_products")
        .update({ status: args.status })
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, "products"] }),
  });
}

/* ─────────────────────────── project items ──────────────────────────── */

export function useProjectItems(projectId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, "items", projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<ProjectItem[]> => {
      const { data, error } = await sb
        .from("project_items")
        .select("*")
        .eq("project_id", projectId!)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as ProjectItem[];
    },
  });
}

/** Projects that already carry specified items (workspace list). */
export function useProductProjects() {
  return useQuery({
    queryKey: [...KEY, "projects"],
    queryFn: async () => {
      const [projects, items] = await Promise.all([
        sb.from("pm_projects").select("id, name, client, status, start_date").order("name"),
        sb.from("project_items").select("project_id, quantity, unit_price"),
      ]);
      if (projects.error) throw projects.error;
      if (items.error) throw items.error;
      const stats = new Map<string, { count: number; total: number }>();
      for (const it of (items.data ?? []) as Array<{
        project_id: string;
        quantity: number;
        unit_price: number | null;
      }>) {
        const s = stats.get(it.project_id) ?? { count: 0, total: 0 };
        s.count += 1;
        s.total += (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);
        stats.set(it.project_id, s);
      }
      return ((projects.data ?? []) as Array<{
        id: string;
        name: string;
        client: string | null;
        status: string;
        start_date: string;
      }>).map((p) => ({
        ...p,
        itemCount: stats.get(p.id)?.count ?? 0,
        itemsValue: stats.get(p.id)?.total ?? 0,
      }));
    },
  });
}

export type ProjectItemInput = Partial<Omit<ProjectItem, "id" | "project_id">> & {
  project_id: string;
  name: string;
};

export function useCreateProjectItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProjectItemInput): Promise<ProjectItem> => {
      const { data, error } = await sb.from("project_items").insert(input).select("*").single();
      if (error) throw error;
      return data as ProjectItem;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: [...KEY, "items", row.project_id] });
      qc.invalidateQueries({ queryKey: [...KEY, "projects"] });
    },
  });
}

/** Snapshot a library product into a project. Library data is only read. */
export function useAddLibraryProductToProject() {
  const create = useCreateProjectItem();
  return useMutation({
    mutationFn: async (args: {
      product: LibraryProduct;
      projectId: string;
      overrides?: Partial<ProjectItemInput>;
    }) => {
      const p = args.product;
      return create.mutateAsync({
        project_id: args.projectId,
        source_library_product_id: p.id,
        name: p.name,
        category_id: p.category_id,
        manufacturer: p.manufacturer,
        designer: p.designer,
        material_spec: p.material_spec,
        dimensions: p.dimensions,
        weight: p.weight,
        unit_price: p.indicative_unit_price,
        currency: p.currency,
        product_url: p.product_url,
        primary_image_path: p.primary_image_path,
        finish_image_path: p.finish_image_path,
        sample_pdf_path: p.sample_pdf_path,
        ref_code: p.ref_code,
        notes: p.notes,
        quantity: 1,
        ...args.overrides,
      });
    },
  });
}

export function useUpdateProjectItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; projectId: string; patch: Partial<ProjectItem> }) => {
      const { error } = await sb.from("project_items").update(args.patch).eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [...KEY, "items", vars.projectId] });
      qc.invalidateQueries({ queryKey: [...KEY, "projects"] });
    },
  });
}

export function useDeleteProjectItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; projectId: string }) => {
      const { error } = await sb.from("project_items").delete().eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [...KEY, "items", vars.projectId] });
      qc.invalidateQueries({ queryKey: [...KEY, "projects"] });
    },
  });
}

export function useDuplicateProjectItem() {
  const create = useCreateProjectItem();
  return useMutation({
    mutationFn: async (item: ProjectItem) => {
      const {
        id: _id,
        created_at: _c,
        updated_at: _u,
        ...rest
      } = item;
      return create.mutateAsync({
        ...(rest as ProjectItemInput),
        sort_order: (item.sort_order ?? 0) + 1,
      });
    },
  });
}

/** Deliberate, never automatic: push a project item's data back to the library. */
export function useUpdateLibraryFromItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: ProjectItem) => {
      if (!item.source_library_product_id) throw new Error("Item has no library origin");
      const { error } = await sb
        .from("library_products")
        .update({
          name: item.name,
          category_id: item.category_id,
          manufacturer: item.manufacturer,
          designer: item.designer,
          material_spec: item.material_spec,
          dimensions: item.dimensions,
          weight: item.weight,
          indicative_unit_price: item.unit_price,
          price_last_updated: new Date().toISOString().slice(0, 10),
          product_url: item.product_url,
          primary_image_path: item.primary_image_path,
          finish_image_path: item.finish_image_path,
          sample_pdf_path: item.sample_pdf_path,
          ref_code: item.ref_code,
        })
        .eq("id", item.source_library_product_id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, "products"] }),
  });
}

/* ────────────────────────────── images ──────────────────────────────── */

export function useUploadProductImage() {
  return useMutation({
    mutationFn: async (file: File): Promise<string> => {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from(PRODUCT_IMAGE_BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      return path;
    },
  });
}

/** Signed URL for a stored image (private bucket), cached for the session. */
export function useProductImageUrl(path: string | null | undefined, width?: number) {
  return useQuery({
    queryKey: [...KEY, "image", path, width ?? 0],
    enabled: !!path,
    staleTime: 45 * 60_000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.storage
        .from(PRODUCT_IMAGE_BUCKET)
        .createSignedUrl(path!, 60 * 60, width && !isPdfPath(path) ? { transform: { width, resize: "contain" } } : undefined);
      if (error) return null;
      return data?.signedUrl ?? null;
    },
  });
}
