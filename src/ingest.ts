// Getting a rulebook into the local library.
// Online: the cloud model reads the PDF (including scanned pages) and returns clean numbered sections.
// Offline or cloud failure: pdf.js extracts the text on this device and we split it locally.
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { ingestModel } from "./firebase";
import { slug, type Game, type Section } from "./store";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const HEADING = /^(\d+(\.\d+)*[.)]?\s+\S.{0,80}|#{1,4}\s+\S.{0,80}|[A-Z][A-Z0-9 '&:,-]{3,60})$/;

/** Split plain text into sections using headings, falling back to ~900-char paragraph chunks. */
export function chunkText(text: string): Section[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const raw: { title: string; body: string[] }[] = [];
  let cur = { title: "Introduction", body: [] as string[] };
  for (const line of lines) {
    const l = line.trim();
    if (l && l.length < 90 && HEADING.test(l) && !/[.,;]$/.test(l)) {
      if (cur.body.join(" ").trim()) raw.push(cur);
      cur = { title: l.replace(/^#+\s*/, ""), body: [] };
    } else {
      cur.body.push(l);
    }
  }
  if (cur.body.join(" ").trim()) raw.push(cur);

  const out: Section[] = [];
  for (const r of raw) {
    const paras = r.body.join("\n").split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
    let buf = "";
    let part = 0;
    const flush = () => {
      if (!buf) return;
      part++;
      out.push({ id: String(out.length + 1), title: part > 1 ? `${r.title} (cont.)` : r.title, text: buf.trim() });
      buf = "";
    };
    for (const p of paras) {
      if (buf.length + p.length > 900) flush();
      buf += (buf ? "\n" : "") + p;
    }
    flush();
  }
  return out;
}

async function fileToBase64(file: Blob): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

async function pdfTextLocal(file: File): Promise<string> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    let line = "";
    const lines: string[] = [];
    for (const it of tc.items as { str: string; hasEOL?: boolean }[]) {
      line += it.str;
      if (it.hasEOL) {
        lines.push(line);
        line = "";
      }
    }
    if (line) lines.push(line);
    pages.push(lines.join("\n"));
  }
  return pages.join("\n\n");
}

async function pdfViaCloud(file: File, name: string): Promise<Section[]> {
  const prompt = `This is the rulebook for "${name}". Extract EVERY rule into numbered sections.
Use the book's own numbering for ids when it has one (e.g. "4.2"); otherwise number sections 1, 2, 3...
Keep the rule wording faithful and complete but drop flavor text, art captions and page furniture.
Each section should cover one rule or topic and be under 180 words. Include setup, turn structure, scoring, end of game, and any FAQ or clarifications printed in the book.`;
  const res = await ingestModel().generateContent([
    prompt,
    { type: "inlineData", inlineData: { mimeType: "application/pdf", data: await fileToBase64(file) } },
  ]);
  const j = JSON.parse(res.response.text());
  const sections: Section[] = (j.sections ?? [])
    .map((s: Section, i: number) => ({ id: String(s.id || i + 1), title: String(s.title || ""), text: String(s.text || "") }))
    .filter((s: Section) => s.text.trim());
  if (!sections.length) throw new Error("No rules found in that PDF");
  return sections;
}

export async function gameFromPdf(file: File, name: string, onStatus: (s: string) => void): Promise<Game> {
  const base = { id: `${slug(name)}-${Date.now().toString(36)}`, name, houseRules: [], addedAt: Date.now() };
  if (navigator.onLine) {
    try {
      onStatus("Cloud is reading the rulebook (one time only)...");
      return { ...base, sections: await pdfViaCloud(file, name), origin: "pdf-cloud" };
    } catch (e) {
      console.warn("Cloud ingest failed, falling back to on-device text extraction", e);
    }
  }
  onStatus("Reading the PDF on this device...");
  const text = await pdfTextLocal(file);
  const sections = chunkText(text);
  if (!sections.length) throw new Error("This PDF has no selectable text. Connect to the internet so the cloud can read it.");
  return { ...base, sections, origin: "pdf-local" };
}

export function gameFromText(text: string, name: string): Game {
  return {
    id: `${slug(name)}-${Date.now().toString(36)}`,
    name,
    sections: chunkText(text),
    houseRules: [],
    origin: "text-local",
    addedAt: Date.now(),
  };
}
