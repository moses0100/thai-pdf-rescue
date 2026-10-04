import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Thai PDF Rescue — กู้ข้อความไทยจาก PDF",
  description:
    "ดึงข้อความ ซ่อม Thai PUA และอ่านภาพสแกนด้วย OCR ในเบราว์เซอร์ของคุณ",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
