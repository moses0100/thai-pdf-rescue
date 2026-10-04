import { test } from "node:test";
import assert from "node:assert/strict";
import { createLoadingTask } from "../../src/lib/pdf";
import { MAX_FILE_BYTES } from "../../src/lib/recovery";
test("rejects renamed non-PDF, empty files and oversized files before parsing", async () => {
  await assert.rejects(
    createLoadingTask(new File(["text"], "notes.txt")),
    /\.pdf/,
  );
  await assert.rejects(createLoadingTask(new File([], "empty.pdf")), /ว่าง/);
  await assert.rejects(
    createLoadingTask(new File(["not a pdf"], "renamed.pdf")),
    /ส่วนหัว/,
  );
  await assert.rejects(
    createLoadingTask(
      new File([new Uint8Array(MAX_FILE_BYTES + 1)], "large.pdf"),
    ),
    /20 MB/,
  );
});
