"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { PDFDocumentProxy, PDFDocumentLoadingTask } from "pdfjs-dist";
import type { Worker } from "tesseract.js";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Upload,
  Undo2,
  Redo2,
  X,
} from "lucide-react";
import { createLoadingTask, extractDocument, renderPage } from "@/lib/pdf";
import {
  edit,
  undo,
  redo,
  exportText,
  safeFilename,
  progressLabel,
  MAX_OCR_PAGES,
  compactThaiSpaces,
  type History,
  type RescuePage,
} from "@/lib/recovery";
import {
  saveSession,
  loadSession,
  clearSession,
  type Session,
} from "@/lib/session";

function download(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function RescueWorkspace() {
  const [pages, setPages] = useState<RescuePage[]>([]);
  const [selected, setSelected] = useState(0);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [raw, setRaw] = useState(false);
  const [pending, setPending] = useState<File | null>(null);
  const pendingRestore = useRef<Session | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [saved, setSaved] = useState<Session | null>(null);
  const [documentVersion, setDocumentVersion] = useState(0);
  const [historyFlags, setHistoryFlags] = useState<
    { past: boolean; future: boolean }[]
  >([]);
  const pdf = useRef<PDFDocumentProxy | null>(null);
  const task = useRef<PDFDocumentLoadingTask | null>(null);
  const worker = useRef<Worker | null>(null);
  const original = useRef<File | null>(null);
  const generation = useRef(0);
  const histories = useRef<History[]>([]);
  const preview = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const current = pages[selected];

  useEffect(() => {
    const token = generation;
    loadSession()
      .then(setSaved)
      .catch(() =>
        setNotice(
          "พื้นที่บันทึกในเครื่องไม่พร้อมใช้งาน ยังเปิดและดาวน์โหลดข้อความได้",
        ),
      );
    return () => {
      token.current++;
      void task.current?.destroy();
      void pdf.current?.loadingTask.destroy();
      void worker.current?.terminate();
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!pdf.current || !preview.current) return;
    const target = preview.current;
    target.replaceChildren();
    renderPage(pdf.current, selected + 1)
      .then((canvas) => {
        if (active) {
          canvas.setAttribute("aria-label", `ภาพต้นฉบับหน้า ${selected + 1}`);
          canvas.setAttribute("role", "img");
          target.replaceChildren(canvas);
        }
      })
      .catch((e) => {
        if (active)
          setError(
            `แสดงภาพไม่ได้: ${e instanceof Error ? e.message : "เกิดข้อผิดพลาด"}`,
          );
      });
    return () => {
      active = false;
    };
  }, [selected, documentVersion]);

  function updateText(
    value: string,
    action: "edit" | "undo" | "redo" = "edit",
  ) {
    const history = histories.current[selected];
    if (!history) return;
    const next =
      action === "undo"
        ? undo(history)
        : action === "redo"
          ? redo(history)
          : edit(history, value);
    histories.current[selected] = next;
    setHistoryFlags(
      histories.current.map((h) => ({
        past: !!h.past.length,
        future: !!h.future.length,
      })),
    );
    setPages((old) =>
      old.map((p, i) => (i === selected ? { ...p, text: next.present } : p)),
    );
  }

  async function openFile(file: File, secret?: string, restore?: Session) {
    const id = ++generation.current;
    setError("");
    setNotice("");
    setBusy("กำลังเปิด PDF…");
    setPending(null);
    let next: PDFDocumentProxy | null = null;
    let loading: PDFDocumentLoadingTask | null = null;
    try {
      loading = await createLoadingTask(file, secret);
      if (id !== generation.current) {
        await loading.destroy();
        return;
      }
      task.current = loading;
      next = await loading.promise;
      const extracted = await extractDocument(
        next,
        () => id !== generation.current,
        (n, total) => {
          if (id === generation.current)
            setBusy(`อ่านข้อความ ${n}/${total} หน้า`);
        },
      );
      if (id !== generation.current) {
        await next.loadingTask.destroy();
        return;
      }
      const previous = pdf.current;
      pdf.current = next;
      original.current = file;
      const result =
        restore && restore.pages.length === extracted.length
          ? restore.pages
          : extracted;
      histories.current = result.map((p) => ({
        past: [],
        present: p.text,
        future: [],
      }));
      setHistoryFlags(result.map(() => ({ past: false, future: false })));
      setPages(result);
      setName(file.name);
      setSelected(
        restore
          ? Math.max(0, Math.min(restore.selected, result.length - 1))
          : 0,
      );
      setRaw(false);
      setPassword("");
      pendingRestore.current = undefined;
      setDocumentVersion((v) => v + 1);
      void previous?.loadingTask.destroy();
      setNotice(
        restore
          ? "เปิด checkpoint แล้ว ข้อความที่แก้ไว้กลับมาครบ"
          : "อ่านไฟล์แล้ว ตรวจเทียบกับภาพก่อนนำข้อความไปใช้",
      );
    } catch (e) {
      if (next) await next.loadingTask.destroy();
      else await loading?.destroy();
      if (id !== generation.current) return;
      if (e instanceof Error && e.name === "PasswordException") {
        pendingRestore.current = restore;
        setPending(file);
        setError("PDF นี้มีรหัสผ่าน กรุณาใส่รหัสที่ใช้เปิดไฟล์");
      } else
        setError(e instanceof Error ? e.message : "ไม่สามารถเปิด PDF นี้ได้");
    } finally {
      if (id === generation.current) {
        setBusy("");
        task.current = null;
      }
    }
  }

  async function sample(file: string) {
    try {
      setError("");
      const response = await fetch(`/samples/${file}`);
      if (!response.ok) throw new Error("เปิดตัวอย่างไม่ได้");
      await openFile(
        new File([await response.blob()], file, { type: "application/pdf" }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "เปิดตัวอย่างไม่ได้");
    }
  }

  function cancel() {
    generation.current++;
    void task.current?.destroy();
    void worker.current?.terminate();
    worker.current = null;
    setBusy("");
    setNotice("ยกเลิกแล้ว ข้อความที่ทำเสร็จก่อนหน้ายังอยู่");
  }

  async function ocr(all = false) {
    if (!pdf.current) return;
    const targets = all
      ? pages.map((p, i) => (p.kind === "scan" ? i : -1)).filter((i) => i >= 0)
      : [selected];
    if (!targets.length) {
      setNotice("ไม่มีหน้าที่ต้อง OCR อัตโนมัติ เลือกหน้าแล้วสั่ง OCR ได้เอง");
      return;
    }
    if (targets.length > MAX_OCR_PAGES) {
      setError("OCR เป็นชุดได้สูงสุด 10 หน้า กรุณาทำทีละหน้า");
      return;
    }
    const id = ++generation.current;
    setError("");
    setBusy("เตรียม OCR ภาษาไทย + อังกฤษ…");
    let activeWorker: Worker | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const { createWorker } = await import("tesseract.js");
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          if (id === generation.current) {
            generation.current++;
            setBusy("");
            setError("OCR ใช้เวลานานเกิน 3 นาที กรุณาลองใหม่ทีละหน้า");
          }
          void activeWorker?.terminate();
          reject(new Error("OCR timeout"));
        }, 180_000);
      });
      await Promise.race([
        (async () => {
          activeWorker = await createWorker(["tha", "eng"], 1, {
            workerPath: "/vendor/tesseract/worker.min.js",
            corePath: "/vendor/tesseract-core",
            langPath: "/vendor/tessdata",
            workerBlobURL: false,
            logger: (m) => {
              if (id === generation.current)
                setBusy(
                  `OCR · ${m.status} ${Math.round((m.progress ?? 0) * 100)}%`,
                );
            },
          });
          if (id !== generation.current) {
            await activeWorker.terminate();
            return;
          }
          worker.current = activeWorker;
          for (const index of targets) {
            if (id !== generation.current || !pdf.current) break;
            const canvas = await renderPage(pdf.current, index + 1, 2000);
            const { data } = await activeWorker.recognize(canvas);
            if (id !== generation.current) break;
            if (!data.text.trim()) {
              setNotice(
                `หน้า ${index + 1}: OCR ไม่พบข้อความ เก็บข้อความเดิมไว้`,
              );
              continue;
            }
            const nextHistory = edit(
              histories.current[index],
              data.text.trim(),
            );
            histories.current[index] = nextHistory;
            setHistoryFlags(
              histories.current.map((h) => ({
                past: !!h.past.length,
                future: !!h.future.length,
              })),
            );
            setPages((old) =>
              old.map((p, i) =>
                i === index
                  ? {
                      ...p,
                      text: nextHistory.present,
                      source: "ocr",
                      confidence: data.confidence,
                      warnings: [
                        "OCR อาจอ่านสระ วรรณยุกต์ และตัวเลขผิด ต้องตรวจเทียบกับภาพก่อนนำไปใช้",
                      ],
                    }
                  : p,
              ),
            );
          }
        })(),
        timeout,
      ]);
      if (id === generation.current)
        setNotice("OCR เสร็จแล้ว ตรวจผลกับภาพต้นฉบับ และแก้ข้อความได้ด้านขวา");
    } catch (e) {
      if (id === generation.current)
        setError(e instanceof Error ? e.message : "OCR ไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      clearTimeout(timer);
      if (activeWorker)
        await (activeWorker as Worker).terminate().catch(() => {});
      if (id === generation.current) {
        worker.current = null;
        setBusy("");
      }
    }
  }

  async function checkpoint() {
    try {
      if (!original.current) return;
      const session: Session = {
        version: 1,
        name,
        bytes: await original.current.arrayBuffer(),
        pages,
        selected,
        savedAt: new Date().toISOString(),
      };
      await saveSession(session);
      setSaved(session);
      setNotice(
        "บันทึก checkpoint ในเบราว์เซอร์นี้แล้ว รวมไฟล์ต้นฉบับและข้อความที่แก้ไว้",
      );
    } catch {
      setError(
        "บันทึกไม่ได้ พื้นที่เครื่องอาจเต็ม กรุณาดาวน์โหลดข้อความเก็บไว้",
      );
    }
  }

  const repaired = pages.reduce((total, p) => total + p.repaired, 0);
  const scans = pages.filter((p) => p.kind === "scan").length;
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/">
          <span className="brand-icon">
            <FileText size={22} />
          </span>{" "}
          Thai PDF <strong>Rescue</strong>
          <span className="beta">LOCAL FIRST</span>
        </Link>
        <span className="privacy">
          <ShieldCheck size={16} /> ไฟล์อยู่ในเครื่องคุณ
        </span>
      </header>
      <main>
        <div className="intro">
          <div>
            <div className="eyebrow">
              เครื่องมือเล็ก ๆ สำหรับปัญหาใหญ่ของ PDF ไทย
            </div>
            <h1>
              ข้อความติดอยู่ใน PDF?
              <br />
              <span>เอากลับมาใช้งานได้อีกครั้ง</span>
            </h1>
            <p>
              ดึงข้อความ · แก้อักขระไทยบางรูปแบบ · อ่านภาพสแกนด้วย OCR
              <br />
              ตรวจเทียบต้นฉบับ แก้ไข แล้วดาวน์โหลดเป็นไฟล์ข้อความ
            </p>
          </div>
          <div className="intro-note">
            <Sparkles size={25} />
            <strong>กู้ข้อความ ไม่แก้ไฟล์ต้นฉบับ</strong>
            <span>
              ทำงานในเบราว์เซอร์
              <br />
              ไม่ต้องสมัคร ไม่ใช้ API เสียเงิน
            </span>
          </div>
        </div>
        {saved && (
          <div className="checkpoint-banner">
            <div>
              <strong>มี checkpoint ที่บันทึกไว้</strong>
              <span>
                {saved.name} · {new Date(saved.savedAt).toLocaleString("th-TH")}
              </span>
            </div>
            <button
              disabled={!!busy}
              onClick={() =>
                void openFile(
                  new File([saved.bytes], saved.name, {
                    type: "application/pdf",
                  }),
                  undefined,
                  saved,
                )
              }
            >
              เปิด checkpoint
            </button>
            <button
              className="quiet"
              disabled={!!busy}
              onClick={() =>
                void clearSession()
                  .then(() => {
                    setSaved(null);
                    setNotice("ลบ checkpoint จากเบราว์เซอร์แล้ว");
                  })
                  .catch(() => setError("ลบ checkpoint ไม่สำเร็จ"))
              }
            >
              ลบที่บันทึก
            </button>
          </div>
        )}
        <input
          ref={input}
          className="file-input"
          type="file"
          accept=".pdf,application/pdf"
          aria-label="เลือกไฟล์ PDF"
          disabled={!!busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void openFile(file);
            e.target.value = "";
          }}
        />
        {!pages.length ? (
          <section
            className="upload-card"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!busy && e.dataTransfer.files[0])
                void openFile(e.dataTransfer.files[0]);
            }}
          >
            <span className="upload-symbol">
              <Upload size={32} />
            </span>
            <h2>วาง PDF ของคุณตรงนี้</h2>
            <p>หรือเลือกไฟล์จากเครื่อง · สูงสุด 20 MB / 60 หน้า</p>
            <button
              className="primary"
              disabled={!!busy}
              onClick={() => input.current?.click()}
            >
              เลือกไฟล์ PDF <ArrowRight size={17} />
            </button>
            <div className="sample-row">
              <span>ยังไม่มีไฟล์? ลองตัวอย่าง</span>
              <button
                disabled={!!busy}
                onClick={() => void sample("thai-pua.pdf")}
              >
                อักษรไทยเสีย
              </button>
              <button
                disabled={!!busy}
                onClick={() => void sample("scanned-thai.pdf")}
              >
                ภาพสแกน
              </button>
              <button
                disabled={!!busy}
                onClick={() => void sample("normal-thai.pdf")}
              >
                ข้อความปกติ
              </button>
            </div>
          </section>
        ) : (
          <>
            <div className="document-bar">
              <div>
                <FileText size={20} />
                <strong>{name}</strong>
                <span>{pages.length} หน้า</span>
              </div>
              <button disabled={!!busy} onClick={() => input.current?.click()}>
                <Upload size={16} />
                เปิดไฟล์อื่น
              </button>
            </div>
            <div className="stats">
              <div>
                <span>จำนวนหน้า</span>
                <strong>
                  {pages.length}
                  <small> หน้า</small>
                </strong>
              </div>
              <div>
                <span>แก้ Thai PUA</span>
                <strong>
                  {repaired}
                  <small> ตัวอักษร</small>
                </strong>
              </div>
              <div>
                <span>อาจต้อง OCR</span>
                <strong>
                  {scans}
                  <small> หน้า</small>
                </strong>
              </div>
              <div>
                <span>ความเป็นส่วนตัว</span>
                <strong className="local">
                  <ShieldCheck size={20} /> ในเครื่อง
                </strong>
              </div>
            </div>
            <div className="workspace-controls">
              <div className="pagination">
                <button
                  aria-label="หน้าก่อนหน้า"
                  disabled={!!busy || selected === 0}
                  onClick={() => setSelected((i) => i - 1)}
                >
                  <ArrowLeft size={17} />
                </button>
                <label>
                  หน้า{" "}
                  <select
                    aria-label="เลือกหน้า"
                    value={selected}
                    disabled={!!busy}
                    onChange={(e) => setSelected(Number(e.target.value))}
                  >
                    {pages.map((p, i) => (
                      <option key={p.number} value={i}>
                        {p.number} · {progressLabel(p.kind)}
                      </option>
                    ))}
                  </select>{" "}
                  / {pages.length}
                </label>
                <button
                  aria-label="หน้าถัดไป"
                  disabled={!!busy || selected === pages.length - 1}
                  onClick={() => setSelected((i) => i + 1)}
                >
                  <ArrowRight size={17} />
                </button>
              </div>
              <div className="actions">
                <button disabled={!!busy} onClick={() => void ocr()}>
                  <Sparkles size={16} /> OCR หน้านี้
                </button>
                {scans > 1 && (
                  <button disabled={!!busy} onClick={() => void ocr(true)}>
                    OCR หน้าสแกนทั้งหมด
                  </button>
                )}
              </div>
            </div>
            <section className="workspace">
              <div className="panel original-panel">
                <div className="panel-head">
                  <strong>
                    01 <span>ต้นฉบับ PDF</span>
                  </strong>
                  <span>หน้า {selected + 1}</span>
                </div>
                <div ref={preview} className="preview" />
              </div>
              <div className="panel editor-panel">
                <div className="panel-head">
                  <strong>
                    02 <span>ข้อความที่นำไปใช้ได้</span>
                  </strong>
                  <span className={`status ${current?.kind}`}>
                    {current && progressLabel(current.kind)}
                  </span>
                </div>
                <div className="editor-tools">
                  <div className="tabs">
                    <button
                      className={!raw ? "active" : ""}
                      onClick={() => setRaw(false)}
                    >
                      ผลลัพธ์
                    </button>
                    <button
                      className={raw ? "active" : ""}
                      onClick={() => setRaw(true)}
                    >
                      ก่อนซ่อม
                    </button>
                  </div>
                  <div>
                    <button
                      aria-label="ย้อนกลับข้อความ"
                      disabled={!!busy || raw || !historyFlags[selected]?.past}
                      onClick={() => updateText("", "undo")}
                    >
                      <Undo2 size={17} />
                    </button>
                    <button
                      aria-label="ทำซ้ำข้อความ"
                      disabled={
                        !!busy || raw || !historyFlags[selected]?.future
                      }
                      onClick={() => updateText("", "redo")}
                    >
                      <Redo2 size={17} />
                    </button>
                  </div>
                </div>
                <textarea
                  aria-label={raw ? "ข้อความก่อนซ่อม" : "ข้อความผลลัพธ์"}
                  value={current ? (raw ? current.raw : current.text) : ""}
                  readOnly={raw || !!busy}
                  placeholder="หน้านี้ไม่มีข้อความ ลองกด OCR หน้านี้"
                  onChange={(e) => updateText(e.target.value)}
                />
                <div className="editor-footer">
                  <span>
                    {(current?.text ?? "").length.toLocaleString("th-TH")}{" "}
                    ตัวอักษร
                    {current?.source === "ocr" &&
                      ` · OCR ${Math.round(current.confidence ?? 0)}% (คะแนนจากระบบ)`}
                  </span>
                  <button
                    disabled={!!busy || raw}
                    onClick={() => {
                      if (current) updateText(current.baseline);
                    }}
                  >
                    <RotateCcw size={14} />
                    คืนค่าหลังดึงข้อความ
                  </button>
                </div>
              </div>
            </section>
            <div className="warnings">
              {current?.source === "ocr" && (
                <>
                  <button
                    disabled={!!busy || raw}
                    onClick={() => updateText(compactThaiSpaces(current.text))}
                  >
                    รวมช่องว่างไทย
                  </button>
                  <p>
                    ปุ่มนี้รวมช่องว่างระหว่างอักษรไทย รวมถึงช่องว่างแบ่งวลี
                    ใช้เมื่อ OCR เว้นวรรคทุกตัว ย้อนกลับได้
                  </p>
                </>
              )}
              {current?.warnings.map((w) => (
                <p key={w}>↳ {w}</p>
              ))}
            </div>
            <div className="export-bar">
              <div>
                <strong>ตรวจแล้ว? เก็บงานของคุณได้เลย</strong>
                <span>
                  checkpoint เก็บในเบราว์เซอร์นี้จนกว่าจะลบข้อมูลเว็บไซต์
                </span>
              </div>
              <div className="actions">
                <button disabled={!!busy} onClick={() => void checkpoint()}>
                  <Check size={16} />
                  บันทึก checkpoint
                </button>
                <button
                  disabled={!!busy}
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(current?.text ?? "")
                      .then(() => setNotice("คัดลอกข้อความหน้านี้แล้ว"))
                      .catch(() =>
                        setError(
                          "คัดลอกไม่ได้ กรุณาเลือกข้อความหรือดาวน์โหลด TXT",
                        ),
                      )
                  }
                >
                  คัดลอกหน้านี้
                </button>
                <button
                  className="primary"
                  disabled={!!busy}
                  onClick={() =>
                    download(
                      "\ufeff" + exportText(pages),
                      `${safeFilename(name)}-rescued.txt`,
                      "text/plain;charset=utf-8",
                    )
                  }
                >
                  <ArrowDownToLine size={17} />
                  ดาวน์โหลด TXT
                </button>
              </div>
            </div>
          </>
        )}
        {busy && (
          <div className="message progress" role="status">
            <span className="spinner" />
            {busy}
            <button onClick={cancel}>
              <X size={15} />
              ยกเลิก
            </button>
          </div>
        )}
        {error && (
          <div className="message error" role="alert">
            {error}
          </div>
        )}
        {pending && (
          <form
            className="password-form"
            onSubmit={(e) => {
              e.preventDefault();
              void openFile(pending, password, pendingRestore.current);
            }}
          >
            <label>
              รหัสผ่าน PDF{" "}
              <input
                type="password"
                aria-label="รหัสผ่าน PDF"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button className="primary">เปิดด้วยรหัสผ่าน</button>
          </form>
        )}
        {notice && (
          <div className="message notice" role="status">
            <Check size={17} />
            {notice}
          </div>
        )}
        {!pages.length && (
          <div className="steps">
            <article>
              <span>01</span>
              <h3>เปิดไฟล์ที่มีปัญหา</h3>
              <p>เลือก PDF หรือใช้ตัวอย่างที่เราสร้างไว้ให้ลอง</p>
            </article>
            <article>
              <span>02</span>
              <h3>ตรวจเทียบและกู้ข้อความ</h3>
              <p>ซ่อม Thai PUA ที่รองรับ หรือใช้ OCR อ่านภาพ</p>
            </article>
            <article>
              <span>03</span>
              <h3>นำข้อความกลับไปใช้</h3>
              <p>แก้ไข คัดลอก และดาวน์โหลด TXT ไปใช้ต่อ</p>
            </article>
          </div>
        )}
        <footer>
          <span>Thai PDF Rescue · สร้างเพื่อให้เอกสารไทยใช้งานต่อได้</span>
          <span>ไม่รองรับการคืนรูปแบบตารางหรือสร้าง PDF ใหม่</span>
        </footer>
      </main>
    </div>
  );
}
