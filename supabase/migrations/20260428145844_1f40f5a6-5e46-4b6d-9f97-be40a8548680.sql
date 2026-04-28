-- Add checksum + size columns
ALTER TABLE public.financial_import_logs
  ADD COLUMN IF NOT EXISTS file_checksum text,
  ADD COLUMN IF NOT EXISTS source_file_size_bytes bigint;

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_financial_import_logs_checksum
  ON public.financial_import_logs (import_type, file_checksum);

-- Prevent duplicate imports of the same file for the same import_type.
-- NULL checksums are allowed (manual/legacy entries) and won't conflict.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_financial_import_logs_type_checksum
  ON public.financial_import_logs (import_type, file_checksum)
  WHERE file_checksum IS NOT NULL;

-- Helpful comment
COMMENT ON COLUMN public.financial_import_logs.file_checksum IS
  'SHA-256 hex digest of the source file. Used to prevent duplicate imports of the same file for a given import_type.';
COMMENT ON COLUMN public.financial_import_logs.source_file_size_bytes IS
  'Size of the source file in bytes at the moment of import.';
