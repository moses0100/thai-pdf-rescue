import { test, expect } from "@playwright/test";
import path from "node:path";
test("repair, edit, undo, persistent checkpoint and text download", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "อักษรไทยเสีย", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "ข้อความผลลัพธ์" });
  await expect(editor).toContainText("กิ่งไม้");
  await expect(
    page.getByRole("img", { name: "ภาพต้นฉบับหน้า 1" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ก่อนซ่อม", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "ข้อความก่อนซ่อม" }),
  ).toContainText("\uf70a");
  await page.getByRole("button", { name: "ผลลัพธ์", exact: true }).click();
  await editor.fill("ข้อความที่แก้เอง");
  await page
    .getByRole("button", { name: "ย้อนกลับข้อความ", exact: true })
    .click();
  await expect(editor).toContainText("กิ่งไม้");
  await page.getByRole("button", { name: "ทำซ้ำข้อความ", exact: true }).click();
  await expect(editor).toHaveValue("ข้อความที่แก้เอง");
  await page
    .getByRole("button", { name: "บันทึก checkpoint", exact: true })
    .click();
  await expect(
    page.getByText("มี checkpoint ที่บันทึกไว้", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "เปิด checkpoint", exact: true })
    .click();
  await expect(editor).toHaveValue("ข้อความที่แก้เอง");
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "ดาวน์โหลด TXT", exact: true })
    .click();
  expect((await downloaded).suggestedFilename()).toBe("thai-pua-rescued.txt");
  await page.getByRole("button", { name: "ลบที่บันทึก", exact: true }).click();
  await expect(
    page.getByText("มี checkpoint ที่บันทึกไว้", { exact: true }),
  ).not.toBeVisible();
});
test("real local Thai OCR does not upload or fetch external assets", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (
      /^https?:/.test(request.url()) &&
      !request.url().startsWith("http://127.0.0.1:3002/")
    )
      external.push(request.url());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "ภาพสแกน", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "ข้อความผลลัพธ์" }),
  ).toHaveValue("");
  await page.getByRole("button", { name: "OCR หน้านี้", exact: true }).click();
  await expect(
    page.getByText(
      "OCR เสร็จแล้ว ตรวจผลกับภาพต้นฉบับ และแก้ข้อความได้ด้านขวา",
      { exact: true },
    ),
  ).toBeVisible({ timeout: 110_000 });
  await page
    .getByRole("button", { name: "รวมช่องว่างไทย", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "ข้อความผลลัพธ์" }),
  ).toContainText("ภาษาไทย");
  expect(external).toEqual([]);
  await page.screenshot({ path: ".cache/ocr-desktop.png", fullPage: true });
});
test("invalid and locked PDFs, mobile layout and mixed page navigation", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("เลือกไฟล์ PDF", { exact: true })
    .setInputFiles(path.resolve("tests/fixtures/invalid.pdf"));
  await expect(
    page.getByRole("alert").filter({ hasText: "ส่วนหัว PDF" }),
  ).toBeVisible();
  await page
    .getByLabel("เลือกไฟล์ PDF", { exact: true })
    .setInputFiles(path.resolve("tests/fixtures/locked.pdf"));
  await page.getByLabel("รหัสผ่าน PDF", { exact: true }).fill("rescue-demo");
  await page
    .getByRole("button", { name: "เปิดด้วยรหัสผ่าน", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "ข้อความผลลัพธ์" }),
  ).toContainText("ภาษาไทย");
  await page.getByRole("textbox", { name: "ข้อความผลลัพธ์" }).fill("งานที่บันทึกใน PDF เข้ารหัส");
  await page.getByRole("button", { name: "บันทึก checkpoint", exact: true }).click();
  await expect(page.getByText("มี checkpoint ที่บันทึกไว้", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "เปิด checkpoint", exact: true }).click();
  await page.getByLabel("รหัสผ่าน PDF", { exact: true }).fill("rescue-demo");
  await page.getByRole("button", { name: "เปิดด้วยรหัสผ่าน", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "ข้อความผลลัพธ์" })).toHaveValue("งานที่บันทึกใน PDF เข้ารหัส");
  await page.getByRole("button", { name: "ลบที่บันทึก", exact: true }).click();
  await page
    .getByLabel("เลือกไฟล์ PDF", { exact: true })
    .setInputFiles(path.resolve("public/samples/mixed-thai.pdf"));
  await page.getByRole("button", { name: "หน้าถัดไป", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "ข้อความผลลัพธ์" }),
  ).toHaveValue("");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "ดาวน์โหลด TXT", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: ".cache/mobile.png", fullPage: true });
});
test("OCR cancellation keeps extracted text and allows a new document", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "ข้อความปกติ", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "ข้อความผลลัพธ์" }),
  ).toContainText("ภาษาไทย");
  await page.getByRole("button", { name: "OCR หน้านี้", exact: true }).click();
  await page.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "ข้อความผลลัพธ์" }),
  ).toContainText("ภาษาไทย");
  await page
    .getByLabel("เลือกไฟล์ PDF", { exact: true })
    .setInputFiles(path.resolve("public/samples/mixed-thai.pdf"));
  await expect(
    page.getByRole("button", { name: "หน้าถัดไป", exact: true }),
  ).toBeEnabled();
});
