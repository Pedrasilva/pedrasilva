# Proposal document selection

- Quote document selection uses the persistent quote-owned main_proposal_id through shared query options; lifecycle, revision cloning and template capture use the same pointer, excluded from commercial snapshot comparisons. Missing/ambiguous links fail closed; composite FK prevents cross-quote selection. Why: timestamps, titles and fixtures must never choose the operative document.
- Letter rendering merges partial saved letter settings over defaults without writing them back. Why: adding a signature must not require replacing document prose or templates.
- Proposal HTML spacing cleanup uses a browser-independent parser only at render/print boundaries, never before persistence; shared global rhythm tokens are exported with completed pages. Why: preview and PDF agree without rewriting editorial HTML.
- Typography uses shared document variables and locally bundled selectable fonts; autosaves require a returned row, preserve latest edits and report failures. Master typography is copied only at explicit new-document creation. Why: controls must not silently claim persistence or alter existing proposals through master changes.
