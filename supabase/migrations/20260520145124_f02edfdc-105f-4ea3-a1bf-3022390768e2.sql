-- Strip internal "Generated " provenance prefix from client-facing titles.
-- Render layer already strips it, but cleaning stored values keeps the editor,
-- admin lists, and any future export paths consistent.

UPDATE public.proposal_blocks
SET title = regexp_replace(title, '^\s*Generated\s+', '', 'i')
WHERE title ~* '^\s*Generated\s+';

UPDATE public.quote_proposal_document_blocks
SET block_title = regexp_replace(block_title, '^\s*Generated\s+', '', 'i')
WHERE block_title ~* '^\s*Generated\s+';