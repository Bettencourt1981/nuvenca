import "server-only";
import { MAX_INDEXED_CHARS } from "@/lib/editors/text";

/** Files larger than this are not opened for indexing (keeps uploads cheap). */
export const MAX_EXTRACT_BYTES = 25 * 1024 * 1024;

type Kind = "text" | "html" | "docx" | "xlsx" | "pptx" | "pdf";

const TEXT_EXTENSIONS = /\.(txt|md|markdown|csv|tsv|json|xml|yaml|yml|log|ini|rtf)$/i;

/** Which extractor handles a file, or null if its contents are not searchable. */
export function extractableKind(name: string, mimeType: string | null): Kind | null {
  const mime = (mimeType ?? "").toLowerCase();
  if (/\.docx$/i.test(name) || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (/\.xlsx$/i.test(name) || mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx";
  if (/\.pptx$/i.test(name) || mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation") return "pptx";
  if (/\.pdf$/i.test(name) || mime === "application/pdf") return "pdf";
  if (/\.html?$/i.test(name) || mime === "text/html") return "html";
  if (TEXT_EXTENSIONS.test(name) || mime.startsWith("text/") || mime === "application/json") return "text";
  return null;
}

function decodeEntities(text: string) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

async function xlsxText(data: Buffer): Promise<string> {
  const ExcelJS = (await import("exceljs")).default;
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(data as unknown as ArrayBuffer);
  const lines: string[] = [];
  book.eachSheet((sheet) => {
    lines.push(sheet.name);
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell) => {
        const text = cell.text?.trim();
        if (text) values.push(text);
      });
      if (values.length) lines.push(values.join(" "));
    });
  });
  return lines.join("\n");
}

async function pptxText(data: Buffer): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(data);
  const slides = Object.keys(zip.files)
    .filter((path) => /^ppt\/(slides|notesSlides)\/[^/]+\.xml$/.test(path))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const lines: string[] = [];
  for (const path of slides) {
    const xml = await zip.files[path].async("string");
    const runs = Array.from(xml.matchAll(/<a:t>([^<]*)<\/a:t>|<\/a:p>/g), (m) => (m[1] === undefined ? "\n" : decodeEntities(m[1])));
    lines.push(runs.join(""));
  }
  return lines.join("\n");
}

async function pdfText(data: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

/** Plain text of an uploaded file (best effort; throws on unreadable files). */
export async function extractText(data: Buffer, kind: Kind): Promise<string> {
  let text: string;
  switch (kind) {
    case "text":
      text = new TextDecoder("utf-8", { fatal: false }).decode(data);
      break;
    case "html":
      text = decodeEntities(
        new TextDecoder("utf-8", { fatal: false })
          .decode(data)
          .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
          .replace(/<\/(p|div|li|tr|h\d|br)>|<br\s*\/?>/gi, "\n")
          .replace(/<[^>]+>/g, " "),
      );
      break;
    case "docx": {
      const mammoth = (await import("mammoth")).default;
      text = (await mammoth.extractRawText({ buffer: data })).value;
      break;
    }
    case "xlsx":
      text = await xlsxText(data);
      break;
    case "pptx":
      text = await pptxText(data);
      break;
    case "pdf":
      text = await pdfText(data);
      break;
  }
  return text
    .replace(/\0/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ ?\n\s*/g, "\n")
    .trim()
    .slice(0, MAX_INDEXED_CHARS);
}
