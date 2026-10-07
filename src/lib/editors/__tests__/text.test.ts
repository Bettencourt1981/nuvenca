import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { getSchema } from "@tiptap/core";
import { prosemirrorJSONToYDoc } from "@tiptap/y-tiptap";
import { documentExtensions } from "../docs/extensions";
import { DOCUMENT_FIELD } from "../native";
import { documentText, spreadsheetText } from "../text";
import { addSheet, cellKey, initWorkbook, sheetCells, sheetCols, sheetRows, sheetsMap } from "../sheets/model";

describe("search text", () => {
  it("extracts a document's text, one line per block", () => {
    const schema = getSchema(documentExtensions());
    const doc = prosemirrorJSONToYDoc(
      schema,
      {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Orçamento" }] },
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Total de " },
              { type: "text", text: "março", marks: [{ type: "bold" }] },
            ],
          },
          {
            type: "bulletList",
            content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Café" }] }] }],
          },
        ],
      },
      DOCUMENT_FIELD,
    );
    expect(documentText(doc)).toBe("Orçamento\nTotal de março\nCafé");
  });

  it("extracts a spreadsheet's sheet names and values in reading order", () => {
    const doc = new Y.Doc();
    const first = initWorkbook(doc, "Vendas");
    const second = addSheet(doc, "Notas");
    const set = (sheetId: string, r: number, c: number, cell: object) => {
      const sheet = sheetsMap(doc).get(sheetId)!;
      sheetCells(sheet).set(cellKey(sheetRows(sheet).get(r), sheetCols(sheet).get(c)), cell);
    };
    set(first, 1, 1, { v: 1200 });
    set(first, 0, 1, { v: "Receita" });
    set(first, 0, 0, { v: "Mês" });
    set(first, 1, 0, { v: "Jan" });
    set(first, 2, 1, { f: "{{x}}" });
    set(second, 0, 0, { v: "Rever em abril" });
    expect(spreadsheetText(doc)).toBe("Vendas\nMês Receita\nJan 1200\nNotas\nRever em abril");
  });
});
