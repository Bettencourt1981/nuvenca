import { describe, expect, it } from "vitest";
import { Document, Packer, Paragraph, TextRun } from "docx";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { extractText, extractableKind } from "../extract-text";

/** A one-page PDF with a single line of (ASCII) text. */
function pdfWith(text: string): Buffer {
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

describe("text extraction for search", () => {
  it("recognises searchable files", () => {
    expect(extractableKind("notas.TXT", null)).toBe("text");
    expect(extractableKind("dados.csv", "text/csv")).toBe("text");
    expect(extractableKind("x", "application/pdf")).toBe("pdf");
    expect(extractableKind("Plano.docx", null)).toBe("docx");
    expect(extractableKind("Contas.xlsx", null)).toBe("xlsx");
    expect(extractableKind("Apresentação.pptx", null)).toBe("pptx");
    expect(extractableKind("foto.jpg", "image/jpeg")).toBeNull();
  });

  it("reads Word documents", async () => {
    const doc = new Document({
      sections: [{ children: [new Paragraph({ children: [new TextRun("Relatório "), new TextRun({ text: "anual", bold: true })] })] }],
    });
    expect(await extractText(await Packer.toBuffer(doc), "docx")).toBe("Relatório anual");
  });

  it("reads Excel workbooks", async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Vendas");
    sheet.addRow(["Mês", "Receita"]);
    sheet.addRow(["Março", 1200]);
    const data = Buffer.from(await book.xlsx.writeBuffer());
    expect(await extractText(data, "xlsx")).toBe("Vendas\nMês Receita\nMarço 1200");
  });

  it("reads PowerPoint slides", async () => {
    const zip = new JSZip();
    zip.file("ppt/slides/slide2.xml", "<p:sld><a:p><a:r><a:t>Segundo</a:t></a:r></a:p></p:sld>");
    zip.file("ppt/slides/slide1.xml", "<p:sld><a:p><a:r><a:t>Olá &amp; </a:t></a:r><a:r><a:t>bem-vindos</a:t></a:r></a:p></p:sld>");
    const data = await zip.generateAsync({ type: "nodebuffer" });
    expect(await extractText(data, "pptx")).toBe("Olá & bem-vindos\nSegundo");
  });

  it("reads PDFs", async () => {
    expect(await extractText(pdfWith("Relatorio de contas"), "pdf")).toBe("Relatorio de contas");
  });

  it("reads text and HTML", async () => {
    expect(await extractText(Buffer.from("linha 1\r\n\r\n  linha 2  "), "text")).toBe("linha 1\nlinha 2");
    expect(
      await extractText(Buffer.from("<html><style>p{}</style><body><p>Caf&eacute;? N&atilde;o: <b>ch&#225;</b></p></body></html>"), "html"),
    ).toContain("chá");
  });
});
