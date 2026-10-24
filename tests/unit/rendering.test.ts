import { test } from "node:test";
import assert from "node:assert/strict";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { MAX_IMAGE_PIXELS } from "../../src/lib/recovery";
import { renderPage } from "../../src/lib/pdf";

async function withCanvas(
  canvas: object,
  run: () => Promise<void>,
  onCreate = () => {},
) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: (tag: string) => {
        assert.equal(tag, "canvas");
        onCreate();
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

test("canvas allocation stays within the pixel budget after integer sizing", async () => {
  for (const [width, height, desiredWidth] of [
    [600, 1601, 1400],
    [600, 100, 10000],
    [0.001, 1_000_000_000, 1400],
    [600, 800, 1400],
  ]) {
    let cleaned = 0;
    let rendered = false;
    const canvas = { width: 0, height: 0, getContext: () => ({}) };
    const pdf = {
      getPage: async () => ({
        getViewport: ({ scale }: { scale: number }) => ({
          width: width * scale,
          height: height * scale,
        }),
        render: () => {
          rendered = true;
          assert.ok(Number.isInteger(canvas.width) && canvas.width >= 1);
          assert.ok(Number.isInteger(canvas.height) && canvas.height >= 1);
          assert.ok(
            canvas.width * canvas.height <= MAX_IMAGE_PIXELS,
            `Allocated ${canvas.width} x ${canvas.height} for ${width} x ${height}`,
          );
          return { promise: Promise.resolve() };
        },
        cleanup: () => {
          cleaned++;
        },
      }),
    } as unknown as PDFDocumentProxy;
    await withCanvas(canvas, async () => {
      assert.equal(await renderPage(pdf, 1, desiredWidth), canvas);
      assert.equal(rendered, true);
      assert.equal(cleaned, 1);
    });
  }
});

test("invalid page dimensions reject before canvas allocation and still clean the page", async () => {
  for (const [width, height, desiredWidth] of [
    [0, 800, 1400], [-1, 800, 1400], [600, 0, 1400],
    [600, Number.NaN, 1400], [Number.POSITIVE_INFINITY, 800, 1400],
    [600, 800, 0], [600, 800, Number.POSITIVE_INFINITY],
    [1e308, 1e308, 1400],
  ]) {
    let cleaned = 0;
    let allocated = 0;
    const pdf = {
      getPage: async () => ({
        getViewport: ({ scale }: { scale: number }) => ({ width: width * scale, height: height * scale }),
        render: () => assert.fail("Invalid dimensions must not start rendering"),
        cleanup: () => { cleaned++; },
      }),
    } as unknown as PDFDocumentProxy;
    await withCanvas({ getContext: () => ({}) }, async () => {
      await assert.rejects(renderPage(pdf, 1, desiredWidth), /ขนาด.*PDF/);
      assert.equal(allocated, 0);
      assert.equal(cleaned, 1);
    }, () => { allocated++; });
  }
});
