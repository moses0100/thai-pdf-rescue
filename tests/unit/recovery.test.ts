import { test } from "node:test";
import assert from "node:assert/strict";
import {
  repairThai,
  analyzePage,
  joinText,
  edit,
  undo,
  redo,
  exportText,
  safeFilename,
  compactThaiSpaces,
} from "../../src/lib/recovery";
test("optional Thai OCR cleanup preserves English, numbers and line boundaries", () => {
  assert.equal(
    compactThaiSpaces("ภา ษา ไท ย PDF Rescue 1,250.00\nก ิ ่ ง"),
    "ภาษาไทย PDF Rescue 1,250.00\nกิ่ง",
  );
});
test("repairs known Thai presentation marks with Thai context", () => {
  assert.deepEqual(repairThai("กิ\uf70aง น้ำ"), {
    text: "กิ่ง น้ำ",
    repaired: 1,
    unknown: 0,
  });
});
test("does not reinterpret symbols without Thai context or invent unknown glyphs", () => {
  assert.equal(repairThai("icon \uf70a").repaired, 0);
  assert.equal(repairThai("ไทย\ue123\ufffd").unknown, 2);
  assert.equal(analyzePage("ภาษาไทย\ue123", 1).kind, "uncertain");
  assert.equal(analyzePage("", 1).kind, "scan");
});
test("preserves combining mark extraction order and explicit line breaks", () => {
  const item = (
    str: string,
    x: number,
    y: number,
    width = 5,
    hasEOL = false,
  ) => ({ str, transform: [10, 0, 0, 10, x, y], width, height: 10, hasEOL });
  assert.equal(
    joinText([
      item("ก", 0, 20),
      item("ิ", 6, 20, 0),
      item("่", 7, 20, 0),
      item("ง", 5, 20, 5, true),
      item("น้ำ", 0, 0),
    ]),
    "กิ่ง\nน้ำ",
  );
});
test("undo, redo and new edits retain recoverable states", () => {
  const first = { past: [], present: "ต้นฉบับ", future: [] };
  const changed = edit(first, "แก้แล้ว");
  assert.equal(undo(changed).present, "ต้นฉบับ");
  assert.equal(redo(undo(changed)).present, "แก้แล้ว");
  assert.deepEqual(edit(undo(changed), "ใหม่").future, []);
});
test("export preserves page boundaries and safe filenames", () => {
  assert.equal(
    exportText([analyzePage("หน้าแรก", 1), analyzePage("หน้าสอง", 2)]),
    "--- หน้า 1 ---\nหน้าแรก\n\n--- หน้า 2 ---\nหน้าสอง",
  );
  assert.equal(safeFilename("../a.pdf"), ".._a");
});
