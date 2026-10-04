import { cp, mkdir, readFile, writeFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const lockPath = resolve(root, "assets-lock.json");
const candidates = [
  {
    path: "public/vendor/tessdata/tha.traineddata.gz",
    url: "https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0/tha.traineddata.gz",
  },
  {
    path: "public/vendor/tessdata/eng.traineddata.gz",
    url: "https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0/eng.traineddata.gz",
  },
  {
    path: "public/fonts/Sarabun-Regular.ttf",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/sarabun/Sarabun-Regular.ttf",
  },
  {
    path: "public/fonts/OFL.txt",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/sarabun/OFL.txt",
  },
];
const refresh = process.argv.includes("--refresh-lock");
const lock = refresh
  ? { files: candidates }
  : JSON.parse(await readFile(lockPath, "utf8"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
for (const asset of lock.files) {
  const target = resolve(root, asset.path);
  await mkdir(resolve(target, ".."), { recursive: true });
  let bytes;
  try {
    bytes = await readFile(target);
  } catch {
    /* Download only if absent. */
  }
  if (!bytes || refresh || hash(bytes) !== asset.sha256) {
    const response = await fetch(asset.url, {
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok)
      throw new Error(`Asset HTTP ${response.status}: ${asset.url}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 20 * 1024 * 1024)
      throw new Error("Asset unexpectedly large");
  }
  if (refresh) asset.sha256 = hash(bytes);
  if (hash(bytes) !== asset.sha256)
    throw new Error(
      `Checksum mismatch for ${asset.path}; inspect upstream before refreshing lock`,
    );
  await writeFile(target, bytes);
  console.log(`Verified ${asset.path} (${bytes.length} bytes)`);
}
if (refresh) await writeFile(lockPath, JSON.stringify(lock, null, 2) + "\n");
const copies = [
  ["pdfjs-dist/build/pdf.worker.min.mjs", "vendor/pdf.worker.min.mjs"],
  ["pdfjs-dist/cmaps", "vendor/cmaps"],
  ["pdfjs-dist/standard_fonts", "vendor/standard_fonts"],
  ["pdfjs-dist/wasm", "vendor/wasm"],
  ["tesseract.js/dist/worker.min.js", "vendor/tesseract/worker.min.js"],
  ["tesseract.js-core", "vendor/tesseract-core"],
];
for (const [source, target] of copies) {
  const from = resolve(root, "node_modules", source);
  await access(from);
  await mkdir(resolve(root, "public", target, ".."), { recursive: true });
  await cp(from, resolve(root, "public", target), { recursive: true });
}
console.log("Browser assets ready; runtime uses same-origin assets only.");
