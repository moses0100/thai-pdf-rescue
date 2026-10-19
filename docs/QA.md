# บันทึกตรวจสอบรุ่น 1.0

ทดสอบบน Windows, Node.js 24.14.1, Chrome ที่ติดตั้งในเครื่อง ผ่าน Playwright Test วันที่ 3 ตุลาคม 2569

## ผลตรวจ

- `npm run verify`: ESLint, TypeScript, unit tests 7 ข้อ และ production build ผ่าน
- `PUBLIC_PDF_QA=1 npm run test:e2e`: browser tests 6 ข้อผ่าน รวม OCR จริงและเอกสารสาธารณะสองไฟล์
- DevQuest เดิม: lint, typecheck และ unit tests 4 ข้อผ่านหลังแยกโปรเจกต์
- ตรวจภาพ PDF ตัวอย่าง ภาพ desktop และ mobile แล้ว ไม่มีแนวนอนล้นที่ viewport 390 px
- ทดสอบ checkpoint/rollback ด้วย ZIP และ SHA-256 กู้ source ลงโฟลเดอร์ใหม่ และตรวจไฟล์กับ snapshot; ปฏิเสธ ZIP ที่ checksum ถูกแก้
- สำเนาที่กู้คืนติดตั้ง `npm ci` และผ่าน `npm run verify` โดยดาวน์โหลด assets ใหม่ครบ ไม่อาศัย node_modules ของต้นฉบับ

ไม่ได้ทดสอบ Safari/Firefox หรือ deploy เว็บไซต์บนผู้ให้บริการภายนอก GitHub CI จะตรวจเพิ่มหลัง push ผล OCR เป็นการตรวจว่า pipeline ทำงาน ไม่ใช่ benchmark ความแม่นยำภาษาไทย

## เอกสารสาธารณะที่หาและทดลองจริง

ดาวน์โหลดไว้ใน `.cache/public-pdfs/` ที่ไม่ commit ใช้ URL ใน script เพื่อทำซ้ำ; เอกสารต้นฉบับเป็นของ ธปท. ไม่ bundle หรือเผยแพร่สำเนาผ่านแอป

| เอกสาร | ผลในแอป | SHA-256 |
|---|---|---|
| [คำอธิบายสถิติ FI_CB_011_S5](https://app.bot.or.th/BTWS_STAT/statistics/DownloadFile.aspx?file=FI_CB_011_S5_TH.PDF) | 1 หน้า ดึงได้ 2,028 ตัวอักษร พบ unknown 5 ตัว จึงแจ้งให้ตรวจ/OCR ไม่อ้างว่าซ่อมสมบูรณ์ | `6c916dcdce79f20b29f9353c41a9386899ef27da5821f8f1a2a9971f4b29a0d6` |
| [จดหมายข่าว news5912](https://www.bot.or.th/content/dam/bot/satang-stories/downloads/bookletall/newsletter/news5912.pdf) | 1 หน้า ไม่มีข้อความที่ใช้งานได้ก่อน OCR หลัง OCR ได้ 2,026 ตัวอักษร ต้องตรวจสระและตัวเลขเอง | `1d0425184560ac95599f00fe052769c63582f4f6e93b8256c25e84837da90fad` |

PDF public สถิติยังมีรหัสไม่รู้จัก ส่วน OCR ตัวอย่างอ่านคำบางคำผิดแม้คะแนนสูง จึงแสดง original คู่ข้อความและคำเตือนเสมอ ปุ่มรวมช่องว่างไทยเป็นทางเลือกที่ undo ได้

## Checkpoints

| tag | ความหมาย |
|---|---|
| `checkpoint/pdf-rescue-release` | รุ่นพร้อมใช้และคู่มือ หลังตรวจสอบ |

ไฟล์ backup อยู่ใน `checkpoints/` ไม่ขึ้น GitHub ปุ่ม checkpoint ในแอปเก็บเอกสารในเบราว์เซอร์ และแยกจาก Git checkpoints ข้างต้น


## ตรวจเพดานภาพตัวอย่าง — 19 ตุลาคม 2569

- แก้การปัดเศษขนาด canvas: หน้า 600 × 1601 หน่วยเคยได้ภาพ 1369 × 3653 = 5,000,957 พิกเซล เกินเพดาน 5 ล้านเล็กน้อย ตอนนี้ปัดลงและจำกัดด้านยาวเมื่อด้านสั้นเล็กกว่า 1 พิกเซล
- เพิ่ม regression test ครอบคลุมหน้าสูง หน้ากว้าง อัตราส่วนสุดขั้ว และหน้าปกติ ตรวจขนาดจริงก่อนเรียก render และยืนยัน cleanup
- ผ่าน unit tests 17 ข้อ, ESLint, TypeScript และ production build
- Chrome browser tests ผ่าน 4 ข้อ รวม OCR จริงแบบ same-origin, checkpoint/restore, PDF เข้ารหัส, mobile และการยกเลิก OCR; ข้ามเอกสารสาธารณะ 2 ข้อตามค่าเริ่มต้น ไม่ได้ดาวน์โหลดซ้ำ
- สำรองก่อนแก้: checkpoints/before-canvas-budget-20261019.zip ที่ commit 564682d; SHA-256 f24f26da18621b5f391b11a96ecc708e30be6a75564013b889105acbbcb1e537
