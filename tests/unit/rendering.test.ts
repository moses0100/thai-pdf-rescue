import { test } from "node:test";
import assert from "node:assert/strict";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { renderPage } from "../../src/lib/pdf";

async function withCanvas(canvas: object, run: () => Promise<void>) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: (tag: string) => {
        assert.equal(tag, "canvas");
        return canvas;
      },
    },
  });
  try {
    await run();
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
  }
}

function documentWith(
  render: () => { promise: Promise<void> },
  cleanup: () => void,
) {
  return {
    getPage: async () => ({
      getViewport: ({ scale }: { scale: number }) => ({
        width: 600 * scale,
        height: 800 * scale,
      }),
      render,
      cleanup,
    }),
  } as unknown as PDFDocumentProxy;
}

test("preview resources remain available until rendering finishes", async () => {
  let finish!: () => void;
  let started!: () => void;
  const rendering = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  let cleaned = 0;
  const canvas = { getContext: () => ({}) };
  const pdf = documentWith(
    () => {
      started();
      return { promise: rendering };
    },
    () => {
      cleaned++;
    },
  );
  await withCanvas(canvas, async () => {
    const result = renderPage(pdf, 1);
    await ready;
    assert.equal(cleaned, 0);
    finish();
    assert.equal(await result, canvas);
    assert.equal(cleaned, 1);
  });
});

test("failed preview rendering cleans resources and retains the original error", async () => {
  const failure = new Error("Cannot render page");
  let cleaned = 0;
  const pdf = documentWith(
    () => ({ promise: Promise.reject(failure) }),
    () => {
      cleaned++;
    },
  );
  await withCanvas({ getContext: () => ({}) }, async () => {
    await assert.rejects(renderPage(pdf, 1), (error) => error === failure);
    assert.equal(cleaned, 1);
  });
});

test("missing canvas support cleans the acquired page without starting rendering", async () => {
  let cleaned = 0;
  const pdf = documentWith(
    () => assert.fail("Rendering must not start"),
    () => {
      cleaned++;
    },
  );
  await withCanvas({ getContext: () => null }, async () => {
    await assert.rejects(renderPage(pdf, 1), /Canvas/);
    assert.equal(cleaned, 1);
  });
});
