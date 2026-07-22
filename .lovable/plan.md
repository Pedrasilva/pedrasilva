# Image Library for Proposal Builder

Add an image block to the proposal composer that can pull from a shared PSA image library and fill whitespace in the generated PDF. The block uses a single, size-adjustable image container.

## Database & storage

1. Extend `public.psa_block_type` enum with a new value `image`.
2. Create a new public storage bucket `proposal-images` (publicly readable, write restricted to authenticated users).
3. Add RLS policies on `storage.objects` for `proposal-images`: authenticated users can upload/list/delete; public can read.
4. Create a new table `public.psa_image_library`:
   - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
   - `name text NOT NULL`
   - `storage_path text NOT NULL`
   - `bucket text NOT NULL DEFAULT 'proposal-images'`
   - `size_hint text` (optional default, e.g. `1/2`, `1/3`)
   - `created_by uuid REFERENCES auth.users(id)`
   - `created_at / updated_at timestamptz DEFAULT now()`
   - GRANT SELECT, INSERT, UPDATE, DELETE to authenticated; ALL to service_role.
   - Enable RLS with a read-all policy for authenticated and a write-only-own policy for authenticated.
5. Seed the `psa_block_library` table with one `image` entry so the composer library includes it.

## Types & constants

- Update `src/lib/psa-proposal/types.ts`:
  - Add `image` to `PsaBlockType` union.
  - Add `PsaImageLibrary` interface.
- Update `src/lib/psa-proposal/use-psa-proposal.ts`:
  - Add `image: "Imagem"` to `BLOCK_TYPE_LABEL`.
  - Add `useProposalImages()` query hook reading `psa_image_library`.
  - Add `useUploadProposalImage()` mutation for upload + insert into table.

## Composer UI

- Add an `image` entry to the manual block library in `src/components/psa-composer/block-library-panel.tsx`.
- In `src/components/psa-composer/canvas.tsx` add `image` to `INLINE_EDITABLE_TYPES` so it can be configured when selected.
- In `src/components/psa-composer/block-settings-panel.tsx`, when `block.block_type === "image"`, render a dedicated panel:
  - Grid/thumbnails of existing images from `psa_image_library`.
  - File drop / upload button to add a new image to the library and immediately select it.
  - Size selector: `1/4`, `1/3`, `1/2`, `2/3` (stored in `content_rich.size`).
  - Optional caption/alt text input (stored in `content_rich.caption` and `content_rich.alt`).

## Block rendering

- In `src/components/psa-composer/block-renderer.tsx`, add `case "image"` in `BlockBody`:
  - Render an `<img>` wrapped in a figure.
  - Map `content_rich.size` to a fixed height class that approximates the page fraction within the A4 print container (e.g. `h-[297mm]` for full page, `h-[148.5mm]` for 1/2, etc.).
  - Use `object-cover` and `w-full` so the image fills the page width.
  - Show caption below if filled.
  - In edit mode, show the selected image + placeholder + size selector instead of rich text.

## Print / PDF styling

- In `src/styles.css` add `.proposal-image-block` print rules:
  - `break-inside: avoid;`
  - Image `max-width: 100%;`
  - Fixed heights sized relative to the A4 content area (`calc(var(--psa-page-height) * X)`), never exceeding the printable page.

## Admin library page

- Create `src/routes/_app.admin.proposal-images.tsx`:
  - Grid of uploaded images with name, size, upload date, and delete action.
  - Upload button to add new global images.
- Add a link in `src/routes/_app.admin.index.tsx` under "Catálogos comerciais" (or a new "Propostas" group) to `/admin/proposal-images`.

## Translations

- Add EN and PT-PT keys in `src/i18n/locales/*/crm.json` (or `common.json`) for:
  - `proposal.imageBlock.label`, `.selectImage`, `.uploadImage`, `.size`, `.sizes.*`, `.caption`, `.alt`, `.placeholder`, `.adminTitle`, `.adminDescription`.

## Verification

- After migration, confirm `image` appears in the proposal builder library.
- Confirm an uploaded image can be selected, sized, and renders in PDF preview.
- Confirm the image does not overflow or get clipped at page boundaries when printed.