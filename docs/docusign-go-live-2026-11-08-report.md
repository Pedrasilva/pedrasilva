# DocuSign demo Go-Live verification — 8 November 2026

## Result

- Integration key: `02b23c8f-16d2-48b3-94b3-ed2dea8f7b25` (exact configured-key equality checked before requests).
- UTC/Lisbon: 8 November 2026, main run **23:09:37–23:09:58**.
- **22 successful eSignature REST calls**, all HTTP 200 except creation HTTP 201; **zero DocuSign errors**.
- OAuth JWT grant authenticated using the portal's existing server-only WebCrypto implementation (`src/lib/docusign/docusign.server.ts`). Main-run OAuth token request HTTP 200 is additional and excluded from the 22 qualifying REST calls.
- Preliminary OAuth/token and OAuth/userinfo checks at 23:08:55 also returned HTTP 200. Overall: **25 successful DocuSign HTTP requests**, comprising 22 REST requests and 3 OAuth/userinfo requests.
- Only `account-d.docusign.com` and `demo.docusign.net` permitted; redirects rejected. Demo account membership confirmed through userinfo. No credentials/tokens persisted in evidence.
- Test envelope: `0f722789-ce91-8d53-815a-9889ecb00875`; recipient `luis@pedrasilva.com`; final authoritative status **voided**.

## Exercised flow and request count

| Operation | REST calls | Result |
|---|---:|---|
| Create draft with 16 synthetic PDF sheets and one test signer | 1 | 201; envelope ID returned |
| Send existing draft | 1 | 200 |
| Read sent envelope status | 1 | 200; sent/delivered state validated |
| List envelope documents | 1 | 200; exactly 16 test documents |
| Download each distinct synthetic PDF, documents 1–16 | 16 | 200 each; each PDF signature validated |
| Void the test envelope | 1 | 200 |
| Read final status after explicit void operation | 1 | 200; voided |
| **Total** | **22** | **Zero errors** |

Reads were not a status-polling loop; the two status reads verified explicit send and void transitions. Sixteen different document downloads tested the supplied synthetic multi-document envelope. No signatures were requested for completion; the email explains no action is required and that the envelope will be voided.

This is an API-level end-to-end test using the existing OAuth helper and saved integration credentials, not a proposal-editor dispatch/UI test. No real proposal PDFs, client records, signature rows, or production endpoints were used. The isolated runner/documents/downloads stayed under `/tmp/docusign-go-live`; durable sanitized request evidence is `docs/docusign-go-live-2026-11-08-calls.json`. The only lasting DocuSign artifact is the intentionally voided demo test envelope.

## Historical evidence from our own records

Read-only inspection of `public.psa_proposal_signatures` found seven persisted envelope records:

| Sent/created UTC | Current recorded status | Recorded completion UTC |
|---|---|---|
| 2026-08-08 11:34:27.596725 | completed | 2026-08-08 11:40:29.443 |
| 2026-08-08 12:07:59.344570 | completed | 2026-08-08 12:10:08.577 |
| 2026-08-08 12:27:05.079233 | completed | 2026-08-08 12:34:48.817 |
| 2026-08-08 13:44:19.164384 | completed | 2026-08-08 13:47:18.557 |
| 2026-08-09 14:38:04.310600 | sent | — |
| 2026-08-09 21:34:20.210329 | completed | 2026-08-09 21:59:36.393 |
| 2026-09-04 11:01:25.689421 | completed | 2026-09-04 11:04:02.637 |

These establish previous portal envelope activity, **not a count of HTTP calls**. The table and inspected client do not retain historical request status/trace tokens, OAuth requests, integration-key identity, or demo/production environment per record. Consequently, these records cannot prove a previous error-free 20-call run for this particular key. No historical client content was read or changed.

One internal read-only history lookup initially referenced nonexistent `declined_at`/`voided_at` fields and failed with a schema error; the corrected SELECT succeeded. This was not a DocuSign request and is not included in API errors/counts.

## Go-Live boundary

The published criterion is the latest 20 qualifying API calls without errors; OAuth/login/userinfo do not count. This run produced 22 successful eSignature calls, with trace tokens retained in the call log. **No production activation, integration-key promotion, API Dashboard inspection, or review submission was performed or claimed.** Provider acceptance remains separate from the observed API successes.

References:
- https://developers.docusign.com/docs/esign-rest-api/go-live/
- https://www.docusign.com/blog/developers/the-trenches-go-live-failures
- https://developers.docusign.com/docs/esign-rest-api/reference/envelopes/envelopedocuments/get/
- https://developers.docusign.com/docs/esign-rest-api/esign101/rules-and-limits/

## Files changed

- `docs/docusign-go-live-2026-11-08-report.md`
- `docs/docusign-go-live-2026-11-08-calls.json`
- `roadmap.md`

No application code, database rows, real quote content, or B1 settings changed.