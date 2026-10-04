import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
// Opt-in QA with downloaded public documents. Original files are never redistributed.
for (const name of ["bot-statistics.pdf", "bot-newsletter.pdf"]) {
  test(`public document: ${name}`, async ({ page }) => {
    test.skip(
      !process.env.PUBLIC_PDF_QA,
      "Download public examples and set PUBLIC_PDF_QA=1",
    );
    const file = path.resolve(".cache/public-pdfs", name);
    await page.goto("/");
    await page.getByLabel("เลือกไฟล์ PDF", { exact: true }).setInputFiles(file);
    const editor = page.getByRole("textbox", { name: "ข้อความผลลัพธ์" });
    await expect(editor).toBeVisible();
    await expect(
      page.getByRole("img", { name: "ภาพต้นฉบับหน้า 1" }),
    ).toBeVisible();
    const before = await editor.inputValue();
    if (name === "bot-newsletter.pdf") {
      await page
        .getByRole("button", { name: "OCR หน้านี้", exact: true })
        .click();
      await expect(
        page.getByText(
          "OCR เสร็จแล้ว ตรวจผลกับภาพต้นฉบับ และแก้ข้อความได้ด้านขวา",
          { exact: true },
        ),
      ).toBeVisible({ timeout: 110_000 });
      expect((await editor.inputValue()).length).toBeGreaterThan(100);
    } else expect(before.length).toBeGreaterThan(1000);
    fs.writeFileSync(
      path.resolve(".cache", `${name}.qa.json`),
      JSON.stringify(
        {
          name,
          beforeChars: before.length,
          afterChars: (await editor.inputValue()).length,
          warnings: await page.locator(".warnings").innerText(),
        },
        null,
        2,
      ),
    );
  });
}
