import { test } from "node:test";
import assert from "node:assert/strict";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { extractDocument } from "../../src/lib/pdf";

// Only the PDF.js methods used by extraction are mocked; no DOM or worker is needed.
function documentWith(page: { getTextContent: () => Promise<{ items: [] }>; cleanup: () => void }): PDFDocumentProxy {
  return { numPages: 1, getPage: async () => page } as unknown as PDFDocumentProxy;
}

test("cancellation during the final text request aborts and cleans the page", async () => {
  let cancelled = false;
  let cleaned = 0;
  const progress: number[] = [];
  const pdf = documentWith({
    getTextContent: async () => { cancelled = true; return { items: [] }; },
    cleanup: () => { cleaned++; },
  });
  await assert.rejects(extractDocument(pdf, () => cancelled, page => progress.push(page)), { name: "AbortError" });
  assert.equal(cleaned, 1);
  assert.deepEqual(progress, []);
});

test("a page acquired after cancellation is cleaned without reading its text", async () => {
  let cancelled = false;
  let read = 0;
  let cleaned = 0;
  const pdf = { numPages: 1, getPage: async () => {
    cancelled = true;
    return { getTextContent: async () => { read++; return { items: [] }; }, cleanup: () => { cleaned++; } };
  } } as unknown as PDFDocumentProxy;
  await assert.rejects(extractDocument(pdf, () => cancelled, () => assert.fail("No progress after cancellation")), { name: "AbortError" });
  assert.equal(read, 0);
  assert.equal(cleaned, 1);
});

test("text extraction errors preserve the original error and clean the page", async () => {
  const failure = new Error("Broken text stream");
  let cleaned = 0;
  const pdf = documentWith({ getTextContent: async () => { throw failure; }, cleanup: () => { cleaned++; } });
  await assert.rejects(extractDocument(pdf, () => false, () => assert.fail("No progress on failure")), error => error === failure);
  assert.equal(cleaned, 1);
});

test("successful extraction still produces pages and reports progress after cleanup", async () => {
  let cleaned = false;
  const progress: number[][] = [];
  const pdf = documentWith({ getTextContent: async () => ({ items: [] }), cleanup: () => { cleaned = true; } });
  const pages = await extractDocument(pdf, () => false, (page, total) => {
    assert.equal(cleaned, true);
    progress.push([page, total]);
  });
  assert.equal(pages.length, 1);
  assert.equal(pages[0].number, 1);
  assert.deepEqual(progress, [[1, 1]]);
});
