import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
const directory = resolve(import.meta.dirname, "../.cache/public-pdfs");
mkdirSync(directory, { recursive: true });
const sources = [
  {
    name: "bot-statistics.pdf",
    url: "https://app.bot.or.th/BTWS_STAT/statistics/DownloadFile.aspx?file=FI_CB_011_S5_TH.PDF",
  },
  {
    name: "bot-newsletter.pdf",
    url: "https://www.bot.or.th/content/dam/bot/satang-stories/downloads/bookletall/newsletter/news5912.pdf",
  },
];
const report = [];
for (const source of sources) {
  try {
    const response = await fetch(source.url, {
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (
      bytes.length > 20 * 1024 * 1024 ||
      !bytes.subarray(0, 1024).toString("latin1").includes("%PDF-")
    )
      throw new Error("Not an eligible PDF");
    writeFileSync(resolve(directory, source.name), bytes);
    report.push({
      ...source,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    console.log(`Downloaded ${source.name}: ${bytes.length} bytes`);
  } catch (error) {
    report.push({ ...source, error: String(error) });
    console.log(`Unavailable: ${source.name}: ${error}`);
  }
}
writeFileSync(
  resolve(directory, "sources.json"),
  JSON.stringify(report, null, 2),
);
