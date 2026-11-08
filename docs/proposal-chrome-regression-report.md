# Proposal builder — chrome regression, 8 November 2026

## Result
All nine combinations PASS: **1024, 1400, 1740 px × Edit, Split, Pages**. App rail, quote workflow stepbar, Proposal tab, composer toolbar, block library and settings panel remain visible and inside the viewport. No browser errors. Zero Paged.js inserted styles in the parent document. Evidence: [screenshots and results](proposal-chrome-regression/).

| Width | Edit | Split | Pages |
|---|---|---|---|
| 1024 | [PASS](proposal-chrome-regression/1024-edit.png) | [PASS](proposal-chrome-regression/1024-split.png) | [PASS](proposal-chrome-regression/1024-pages.png) |
| 1400 | [PASS](proposal-chrome-regression/1400-edit.png) | [PASS](proposal-chrome-regression/1400-split.png) | [PASS](proposal-chrome-regression/1400-pages.png) |
| 1740 | [PASS](proposal-chrome-regression/1740-edit.png) | [PASS](proposal-chrome-regression/1740-split.png) | [PASS](proposal-chrome-regression/1740-pages.png) |

## Exact cause
Not an automatic whole-body polyfill invocation. The explicit `Previewer` was instantiated in the application's JavaScript realm and its polisher injected transformed copies of the whole application stylesheet into the application head, despite the offscreen target container. Paged.js 0.4.3 `src/modules/paged-media/print-media.js`, `PrintMedia.onAtMedia`, **removes the `@media print` wrapper and appends its rules as unconditional CSS**, while removing screen media rules. This activated the application's global print hides (`body *`, `.print:hidden`, `.no-print`, etc.) in normal screen mode. A screen-only visibility override could not restore `display:none` controls.

## Repair
- Load the packaged non-polyfill runtime as raw text, execute it only inside a dedicated iframe document, and instantiate its own `frameWindow.Paged.Previewer`. Merely passing an iframe target to a parent-realm Previewer would not isolate the injected styles.
- Source remains the live canvas, readiness gate and 300 ms debounce unchanged. Generated sheets, margin furniture and styles never leave the iframe. Parent contains only the iframe and status.
- Print waits for the completed iframe snapshot and copies exactly its sheets and styles; it does not paginate again. Physical PDF **11 pages**, screen **11 pages**, same first block on **11/11** pages. [PDF](proposal-chrome-regression/comparison.pdf), IDs in [results](proposal-chrome-regression/results.json). This run reflects the currently loaded document; it is not a claim that the older 12-page document state is unchanged. Native printer dialogue and pixel-perfect imagery remain outside this automated check.
- Toolbar wraps at narrower widths. Library/settings remain mounted in Pages as requested. Proposal tab was explicitly hidden by pre-existing quote-workflow code independently of Paged.js; it is now exposed for the content step. Estimate tabs still follow their original workflow scope.

## Intentional duplicate stages — preserved
Two exact copies of the original Estudo Prévio exist in Hotel Chiado:
- `db9736ec-ce7b-4482-8750-5a234a3b4be2`, created **8 Nov 11:35:46 UTC**.
- `7d2e3a62-da65-4aaa-889a-5b6a6f8749c6`, created **8 Nov 11:35:53 UTC**.

Both precede the Phase 1 request at 15:32. Luis confirmed during this repair that he duplicated them intentionally to rename stages and instructed that they remain. **Neither was removed or changed.** No audit record identifies their creator; Luis's confirmation resolves that question. Live enumeration found these are the only proposal blocks created on 8 November. Historical absence of other edits cannot be proven from an empty audit history, so no unsupported historical blanket claim is made.

Current verification performed no content writes and no database fixtures. Direct writes were intercepted; none occurred in the final nine-state run. Full row hashes before/after the final verification:
- 481 blocks: `502bb550649502e0558f257a20ee1dce` unchanged.
- 21 proposals: `4587f8c0f8f0472e7e04963fa6a9558c` unchanged.

These hashes establish preservation for this verification window, not retroactive proof of every prior test. The initial reproduction used the existing automatic snapshot-on-open behavior before later read-only runs suppressed it; it did not edit quote/proposal/block content.

## Tests and files
- `scripts/test-paged-frame-isolation.py`: real Paged.js, disposable in-memory document, 2 A4 sheets, explicit break/first-block checks, parent chrome visible and parent inserted styles zero — PASS.
- `scripts/test-composer-chrome.py`: authenticated read-only nine-state checks, export first-block parity — PASS.
- Existing pagination readiness + payment timing tests: **9 PASS**. Translation checker: **0 new candidates**. Build OK.
- Changed: `src/lib/psa-proposal/paged-frame.ts`, `src/components/psa-composer/{paginated-preview,composer-shell,composer-top-bar}.tsx`, `src/styles.css`, `src/routes/_app.crm.quotes.$quoteId.tsx`; associated tests, rendering rules, roadmap and this report/evidence.

B1 remains OFF; no B2, gate actions, migrations, real quote edits, stage/date/payment/contract changes.