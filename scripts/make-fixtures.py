"""Generate owned, redistributable PDF examples. Uses the bundled Sarabun OFL font."""
from pathlib import Path
import re
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, DecodedStreamObject
import pypdfium2 as pdfium

root = Path(__file__).resolve().parents[1]
samples = root / "public/samples"
fixtures = root / "tests/fixtures"
cache = root / ".cache"
for directory in [samples, fixtures, cache]:
    directory.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont("Sarabun", str(root / "public/fonts/Sarabun-Regular.ttf")))
normal = samples / "normal-thai.pdf"
c = canvas.Canvas(str(normal), pagesize=(595, 842), invariant=True)
c.setTitle("Thai PDF Rescue - owned demonstration")
c.setFillColorRGB(.71, .33, .24)
c.setFont("Sarabun", 24)
c.drawString(50, 760, "ทดสอบการกู้ข้อความภาษาไทย")
c.setFillColorRGB(.15, .2, .17)
c.setFont("Sarabun", 17)
lines = ["เอกสารตัวอย่างสำหรับ Thai PDF Rescue", "อ่านข้อความไทยให้กลับมาใช้งานได้", "กุ้ง น้ำ ข้าว กิ่งไม้ ผู้ใช้", "ยอดรวม 1,250.00 บาท วันที่ 3 ตุลาคม 2569", "ตรวจสระ วรรณยุกต์ และตัวเลขก่อนใช้งาน", "Sample document - Thai and English."]
for index, line in enumerate(lines):
    c.drawString(50, 690 - index * 45, line)
c.setFont("Sarabun", 12)
c.drawString(50, 90, "สร้างเพื่อทดสอบระบบ ไม่มีข้อมูลส่วนบุคคล")
c.save()

# Change only ToUnicode: visible glyphs stay identical; extracted tone marks become PUA.
writer = PdfWriter(clone_from=str(normal))
count = 0
for page in writer.pages:
    for font_ref in page["/Resources"]["/Font"].values():
        font = font_ref.get_object()
        if "/ToUnicode" in font:
            data = font["/ToUnicode"].get_object().get_data()
            data, changed = re.subn(rb"<0[eE]48>", b"<F70A>", data)
            count += changed
            replacement = DecodedStreamObject()
            replacement.set_data(data)
            font[NameObject("/ToUnicode")] = writer._add_object(replacement)
assert count > 0, "No Thai tone mark mapping found"
writer.write(samples / "thai-pua.pdf")
assert "\uf70a" in PdfReader(samples / "thai-pua.pdf").pages[0].extract_text()

document = pdfium.PdfDocument(str(normal))
image = document[0].render(scale=2).to_pil()
image.save(cache / "fixture-preview.png")
c = canvas.Canvas(str(samples / "scanned-thai.pdf"), pagesize=(595,842), invariant=True)
c.drawImage(ImageReader(image), 0, 0, width=595, height=842)
c.save()
writer = PdfWriter()
writer.add_page(PdfReader(normal).pages[0])
writer.add_page(PdfReader(samples / "scanned-thai.pdf").pages[0])
writer.write(samples / "mixed-thai.pdf")
writer = PdfWriter(clone_from=str(normal))
writer.encrypt("rescue-demo")
writer.write(fixtures / "locked.pdf")
(fixtures / "invalid.pdf").write_text("This is not a PDF", encoding="utf-8")
print("Generated 5 PDF fixtures and an invalid-file fixture")
