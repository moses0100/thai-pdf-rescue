import type { PDFDocumentProxy, PDFDocumentLoadingTask } from "pdfjs-dist";
import {
  analyzePage,
  joinText,
  MAX_FILE_BYTES,
  MAX_PAGES,
  MAX_IMAGE_PIXELS,
  type RescuePage,
} from "./recovery";

export async function createLoadingTask(
  file: File,
  password?: string,
): Promise<PDFDocumentLoadingTask> {
  if (!file.name.toLowerCase().endsWith(".pdf"))
    throw new Error("กรุณาเลือกไฟล์ PDF (.pdf)");
  if (file.size > MAX_FILE_BYTES)
    throw new Error("ไฟล์ใหญ่เกิน 20 MB กรุณาแบ่งไฟล์ก่อน");
  if (!file.size) throw new Error("ไฟล์นี้ว่าง ไม่มีข้อมูล PDF");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!new TextDecoder("latin1").decode(bytes.slice(0, 1024)).includes("%PDF-"))
    throw new Error("ไฟล์นี้ไม่มีส่วนหัว PDF ที่ถูกต้อง");
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
  return pdfjs.getDocument({
    data: bytes,
    password,
    enableXfa: false,
    cMapUrl: "/vendor/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/vendor/standard_fonts/",
    wasmUrl: "/vendor/wasm/",
    maxImageSize: MAX_IMAGE_PIXELS,
    stopAtErrors: true,
  });
}

export async function extractDocument(
  pdf: PDFDocumentProxy,
  cancelled: () => boolean,
  update: (page: number, total: number) => void,
): Promise<RescuePage[]> {
  if (pdf.numPages > MAX_PAGES)
    throw new Error(`รองรับไม่เกิน ${MAX_PAGES} หน้า กรุณาแบ่งไฟล์ก่อน`);
  const pages: RescuePage[] = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    if (cancelled()) throw new DOMException("Cancelled", "AbortError");
    const page = await pdf.getPage(number);
    try {
      // Cancellation may happen while either PDF.js promise is pending.
      if (cancelled()) throw new DOMException("Cancelled", "AbortError");
      const content = await page.getTextContent();
      if (cancelled()) throw new DOMException("Cancelled", "AbortError");
      const items = content.items.filter((item) => "str" in item);
      pages.push(analyzePage(joinText(items), number));
    } finally {
      page.cleanup();
    }
    update(number, pdf.numPages);
  }
  return pages;
}

export async function renderPage(
  pdf: PDFDocumentProxy,
  number: number,
  desiredWidth = 1400,
): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(number);
  try {
    const original = page.getViewport({ scale: 1 });
    const scale = Math.min(
      desiredWidth / original.width,
      Math.sqrt(MAX_IMAGE_PIXELS / (original.width * original.height)),
    );
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("เบราว์เซอร์นี้ไม่รองรับ Canvas");
    await page.render({
      canvas,
      canvasContext: context,
      viewport,
      background: "white",
    }).promise;
    return canvas;
  } finally {
    // Keep resources until rendering settles, then release them on either outcome.
    page.cleanup();
  }
}
