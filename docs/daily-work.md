# Daily development

## 2026-10-10 — download filenames

- Preserve complete Unicode code points at the 100-character filename limit; long names containing emoji previously could end with an unpaired surrogate.
- Normalize empty stems, trailing dots/spaces and Windows device names in the filename helper. The existing `-rescued.txt` suffix remains unchanged.
- Add regression coverage for Thai filenames, emoji, invalid characters, reserved names, ordinary similar names and empty stems.
- Local checks: 9 unit tests, TypeScript, ESLint and production build passed. Initial sandbox build failed on Windows path access; the normal host build passed.
- Before-change checkpoint: `checkpoint/before-filenames-20261010`. Two commits separate implementation/tests and user documentation. No schema or document-content changes.

## 2026-10-14 — extraction cancellation and cleanup

- Recheck cancellation after acquiring a PDF page and after reading its text, including the last page. Cancelled extraction rejects with `AbortError` instead of returning a completed result.
- Release acquired page resources in `finally`, including when text extraction fails. PDF.js requests already in progress still settle before the helper handles cancellation.
- Four regression tests cover cancellation during page acquisition, cancellation during final-page text extraction, original error propagation and successful progress after cleanup.
- Local checks passed: all 13 unit tests, TypeScript, ESLint and production build.
- Before-change checkpoint: `checkpoint/before-extraction-cancel-20261014`. Code, regression tests and development notes are separate commits. Original PDF files remain untouched.
