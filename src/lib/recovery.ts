export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_PAGES = 60;
export const MAX_OCR_PAGES = 10;
export const MAX_IMAGE_PIXELS = 5_000_000;
export type PageKind = "text" | "repairable" | "scan" | "uncertain";
export type RescuePage = {
  number: number;
  raw: string;
  baseline: string;
  text: string;
  kind: PageKind;
  repaired: number;
  unknown: number;
  source: "text" | "ocr";
  confidence: number | null;
  warnings: string[];
};
export type TextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL?: boolean;
  dir?: string;
};

// NECTEC/Microsoft WTT 2.0 Thai presentation glyph mappings. Do not infer a numeric offset.
// Reference: https://linux.thai.net/~thep/th-shape.html
const thaiPua: Record<number, number> = {
  0xf700: 0x0e10,
  0xf701: 0x0e34,
  0xf702: 0x0e35,
  0xf703: 0x0e36,
  0xf704: 0x0e37,
  0xf705: 0x0e48,
  0xf706: 0x0e49,
  0xf707: 0x0e4a,
  0xf708: 0x0e4b,
  0xf709: 0x0e4c,
  0xf70a: 0x0e48,
  0xf70b: 0x0e49,
  0xf70c: 0x0e4a,
  0xf70d: 0x0e4b,
  0xf70e: 0x0e4c,
  0xf70f: 0x0e0d,
  0xf710: 0x0e31,
  0xf711: 0x0e4d,
  0xf712: 0x0e47,
  0xf713: 0x0e34,
  0xf714: 0x0e35,
  0xf715: 0x0e36,
  0xf716: 0x0e37,
  0xf717: 0x0e31,
  0xf718: 0x0e38,
  0xf719: 0x0e39,
  0xf71a: 0x0e3a,
};

export function repairThai(raw: string) {
  let repaired = 0;
  // PUA is also used for symbols. Repair only when the page supplies Thai context.
  const thaiContext = /[\u0e01-\u0e5b]/u.test(raw);
  const text = Array.from(raw, (char) => {
    const point = char.codePointAt(0)!;
    if (thaiContext && thaiPua[point]) {
      repaired++;
      return String.fromCodePoint(thaiPua[point]);
    }
    return char;
  })
    .join("")
    .normalize("NFC");
  const unknown = (text.match(/[\ue000-\uf8ff\ufffd]/gu) ?? []).length;
  return { text, repaired, unknown };
}

/** Preserve PDF reading order. Position is used only to add missing line breaks/spaces.
 * Sorting glyphs by x can scramble zero-width Thai vowels and tone marks. */
export function joinText(items: TextItem[]): string {
  let output = "";
  let previous: TextItem | null = null;
  for (const item of items) {
    if (!item.str && !item.hasEOL) continue;
    if (previous && item.str && !output.endsWith("\n")) {
      const previousY = previous.transform[5],
        y = item.transform[5];
      const size = Math.max(1, Math.abs(item.transform[3]), item.height);
      if (Math.abs(y - previousY) > size * 0.6) output += "\n";
      else {
        const gap =
          item.transform[4] - (previous.transform[4] + previous.width);
        const combiningMark =
          /^[\u0e31\u0e34-\u0e3a\u0e47-\u0e4e\uf701-\uf70e\uf710-\uf71a]/u.test(
            item.str,
          );
        if (
          gap > size * 0.18 &&
          !combiningMark &&
          !/\s$/u.test(output) &&
          !/^\s/u.test(item.str)
        )
          output += " ";
      }
    }
    output += item.str;
    if (item.hasEOL && !output.endsWith("\n")) output += "\n";
    if (item.str) previous = item;
  }
  return output.replace(/[ \t]+\n/g, "\n").trim();
}

export function analyzePage(raw: string, number: number): RescuePage {
  const { text, repaired, unknown } = repairThai(raw);
  const visible = raw.replace(/\s/gu, "");
  const scan = visible.length < 5;
  const warnings: string[] = [];
  if (scan)
    warnings.push(
      "พบข้อความน้อยหรือไม่มีข้อความ อาจเป็นภาพสแกน หน้าว่าง หรือภาพประกอบ ลอง OCR หากหน้านี้มีข้อความ",
    );
  if (unknown)
    warnings.push(
      `ยังพบอักขระที่ไม่รู้จัก ${unknown} ตัว ลอง OCR และตรวจเทียบกับต้นฉบับ`,
    );
  if (repaired)
    warnings.push(
      "แก้เฉพาะ Thai PUA ที่รองรับ ต้องตรวจลำดับสระ วรรณยุกต์ และตัวเลขกับต้นฉบับ",
    );
  if (!scan)
    warnings.push(
      "เอกสารหลายคอลัมน์และตารางอาจมีลำดับข้อความต่างจากภาพ ตรวจผลก่อนนำไปใช้",
    );
  return {
    number,
    raw,
    baseline: text,
    text,
    kind: scan
      ? "scan"
      : unknown
        ? "uncertain"
        : repaired
          ? "repairable"
          : "text",
    repaired,
    unknown,
    source: "text",
    confidence: null,
    warnings,
  };
}

export function safeFilename(name: string): string {
  const cleaned = name
    .trim()
    .replace(/\.pdf$/i, "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
  // Cut at Unicode code-point boundaries, then remove Windows trailing dots/spaces.
  const stem =
    Array.from(cleaned).slice(0, 100).join("").replace(/[. ]+$/u, "") ||
    "document";
  // Device names remain reserved even when followed by an extension.
  return /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(stem)
    ? `_${stem}`
    : stem;
}
// Optional OCR cleanup: this also removes intentional spaces in Thai phrases.
// Keep line boundaries, English words and numeric separators intact.
export function compactThaiSpaces(text: string): string {
  return text.replace(/([\u0e01-\u0e5b])[ \t]+(?=[\u0e01-\u0e5b])/gu, "$1");
}
export function exportText(pages: RescuePage[], withHeaders = true): string {
  return pages
    .map(
      (page) =>
        `${withHeaders ? `--- หน้า ${page.number} ---\n` : ""}${page.text}`,
    )
    .join("\n\n");
}
export function progressLabel(kind: PageKind): string {
  return {
    text: "มีข้อความ",
    repairable: "แก้ Thai PUA ได้",
    scan: "อาจต้อง OCR",
    uncertain: "ควรตรวจเพิ่มเติม",
  }[kind];
}

export type History = { past: string[]; present: string; future: string[] };
export function edit(history: History, value: string): History {
  return value === history.present
    ? history
    : {
        past: [...history.past, history.present].slice(-100),
        present: value,
        future: [],
      };
}
export function undo(history: History): History {
  if (!history.past.length) return history;
  return {
    past: history.past.slice(0, -1),
    present: history.past.at(-1)!,
    future: [history.present, ...history.future].slice(0, 100),
  };
}
export function redo(history: History): History {
  if (!history.future.length) return history;
  return {
    past: [...history.past, history.present].slice(-100),
    present: history.future[0],
    future: history.future.slice(1),
  };
}
