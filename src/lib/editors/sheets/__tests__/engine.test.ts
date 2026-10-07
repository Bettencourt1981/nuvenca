import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Workbook } from "../engine";
import { addSheet, cellKey, deleteRows, initWorkbook, insertRows, replaceWorkbook, sheetCells, sheetsMap } from "../model";
import { parseInput } from "../format";
import { shiftFormula } from "../formula/refs";
import { sortRange } from "../ops";

function setup(locale = "en") {
  const doc = new Y.Doc();
  const sheetId = initWorkbook(doc, "Sheet1");
  const wb = new Workbook(doc, locale);
  doc.on("update", () => wb.invalidate());
  const set = (a1: string, input: string, sid = sheetId) => {
    const match = /^([A-Z]+)(\d+)$/.exec(a1)!;
    const col = match[1].charCodeAt(0) - 65;
    const row = Number(match[2]) - 1;
    const sheet = wb.sheet(sid)!;
    const parsed = parseInput(input, locale);
    const key = cellKey(sheet.rows[row], sheet.cols[col]);
    doc.transact(() => {
      if (parsed.kind === "formula") sheetCells(sheet.map).set(key, { f: wb.formulaFromA1(sid, parsed.formula) });
      else if (parsed.kind === "value") sheetCells(sheet.map).set(key, { v: parsed.value });
    });
  };
  const get = (a1: string, sid = sheetId) => {
    const match = /^([A-Z]+)(\d+)$/.exec(a1)!;
    return wb.value(sid, Number(match[2]) - 1, match[1].charCodeAt(0) - 65);
  };
  const show = (a1: string, sid = sheetId) => {
    const match = /^([A-Z]+)(\d+)$/.exec(a1)!;
    return wb.display(sid, Number(match[2]) - 1, match[1].charCodeAt(0) - 65);
  };
  const edit = (a1: string, sid = sheetId) => {
    const match = /^([A-Z]+)(\d+)$/.exec(a1)!;
    return wb.editText(sid, Number(match[2]) - 1, match[1].charCodeAt(0) - 65);
  };
  return { doc, wb, sheetId, set, get, show, edit };
}

describe("formula engine", () => {
  it("does arithmetic with Excel precedence", () => {
    const { set, get } = setup();
    set("A1", "=1+2*3");
    set("A2", "=-2^2");
    set("A3", "=(1+2)*3");
    set("A4", "=10/4");
    set("A5", "=50%");
    set("A6", '="a"&"b"&1');
    expect(get("A1")).toBe(7);
    expect(get("A2")).toBe(4);
    expect(get("A3")).toBe(9);
    expect(get("A4")).toBe(2.5);
    expect(get("A5")).toBe(0.5);
    expect(get("A6")).toBe("ab1");
  });

  it("references cells and ranges", () => {
    const { set, get } = setup();
    set("A1", "10");
    set("A2", "20");
    set("A3", "30");
    set("B1", "=SUM(A1:A3)");
    set("B2", "=AVERAGE(A1:A3)");
    set("B3", "=A1*2+A2");
    set("B4", "=SUM(A:A)");
    expect(get("B1")).toBe(60);
    expect(get("B2")).toBe(20);
    expect(get("B3")).toBe(40);
    expect(get("B4")).toBe(60);
  });

  it("recalculates when inputs change", () => {
    const { set, get } = setup();
    set("A1", "5");
    set("B1", "=A1*2");
    expect(get("B1")).toBe(10);
    set("A1", "7");
    expect(get("B1")).toBe(14);
  });

  it("detects circular references and errors", () => {
    const { set, get } = setup();
    set("A1", "=B1");
    set("B1", "=A1");
    set("C1", "=1/0");
    set("C2", "=NOSUCHFUNCTION(1)");
    set("C3", "=IFERROR(1/0, \"fallback\")");
    set("C4", "=SUM(");
    expect(String(get("A1"))).toBe("#CIRC!");
    expect(String(get("C1"))).toBe("#DIV/0!");
    expect(String(get("C2"))).toBe("#NAME?");
    expect(get("C3")).toBe("fallback");
    expect(String(get("C4"))).toBe("#ERROR!");
  });

  it("keeps references pointing at the same cells when rows move", () => {
    const { doc, wb, sheetId, set, get, edit } = setup();
    set("A1", "1");
    set("A2", "2");
    set("B1", "=A2*10");
    doc.transact(() => insertRows(wb.sheet(sheetId)!.map, 0, 2));
    expect(edit("B3")).toBe("=A4*10");
    expect(get("B3")).toBe(20);
    doc.transact(() => deleteRows(wb.sheet(sheetId)!.map, 3, 1));
    expect(edit("B3")).toBe("=#REF!*10");
    expect(String(get("B3"))).toBe("#REF!");
  });

  it("supports cross-sheet references and renamed sheets", () => {
    const { doc, wb, sheetId, set, get, edit } = setup();
    const other = addSheet(doc, "Dados");
    set("A1", "42", other);
    set("A1", "=Dados!A1+1");
    expect(get("A1")).toBe(43);
    doc.transact(() => sheetsMap(doc).get(other)!.set("name", "Data 2026"));
    expect(edit("A1")).toBe("='Data 2026'!A1+1");
    expect(wb.sheet(sheetId)).toBeTruthy();
  });

  it("evaluates common functions", () => {
    const { set, get } = setup();
    set("A1", "Lisboa");
    set("A2", "Porto");
    set("A3", "Faro");
    set("B1", "100");
    set("B2", "250");
    set("B3", "75");
    set("C1", '=VLOOKUP("Porto",A1:B3,2,FALSE)');
    set("C2", '=SUMIF(B1:B3,">80")');
    set("C3", '=COUNTIF(A1:A3,"P*")');
    set("C4", '=INDEX(A1:A3,MATCH(75,B1:B3,0))');
    set("C5", '=IF(B1>50,"alto","baixo")');
    set("C6", "=ROUND(2.675,2)");
    set("C7", '=TEXTJOIN(", ",TRUE,A1:A3)');
    set("C8", '=XLOOKUP("Faro",A1:A3,B1:B3)');
    set("C9", "=MAX(B1:B3)-MIN(B1:B3)");
    set("C10", '=SUMIFS(B1:B3,A1:A3,"<>Faro")');
    expect(get("C1")).toBe(250);
    expect(get("C2")).toBe(350);
    expect(get("C3")).toBe(1);
    expect(get("C4")).toBe("Faro");
    expect(get("C5")).toBe("alto");
    expect(get("C6")).toBe(2.68);
    expect(get("C7")).toBe("Lisboa, Porto, Faro");
    expect(get("C8")).toBe(75);
    expect(get("C9")).toBe(175);
    expect(get("C10")).toBe(350);
  });

  it("handles dates as serial numbers", () => {
    const { set, get, show } = setup();
    set("A1", "=DATE(2026,10,7)");
    set("A2", "=YEAR(A1)");
    set("A3", "=EOMONTH(A1,1)");
    set("A4", "=DATEDIF(DATE(2000,1,15),A1,\"Y\")");
    expect(get("A1")).toBe(46302);
    expect(get("A2")).toBe(2026);
    expect(get("A3")).toBe(46356);
    expect(get("A4")).toBe(26);
    expect(show("A2")).toBe("2026");
  });

  it("falls back to formula.js for the rest of the catalogue", () => {
    const { set, get } = setup();
    set("A1", "=PMT(0.05/12,60,10000)");
    set("A2", "=FACT(5)");
    expect(Math.round(Number(get("A1")) * 100) / 100).toBe(-188.71);
    expect(get("A2")).toBe(120);
  });

  it("parses localized input", () => {
    expect(parseInput("1.234,5", "pt")).toMatchObject({ kind: "value", value: 1234.5 });
    expect(parseInput("12,5%", "pt")).toMatchObject({ kind: "value", value: 0.125 });
    expect(parseInput("07/10/2026", "pt")).toMatchObject({ kind: "value", value: 46302 });
    expect(parseInput("'0123", "en")).toEqual({ kind: "value", value: "0123" });
    expect(parseInput("=A1", "en")).toEqual({ kind: "formula", formula: "A1" });
  });

  it("formats numbers for the locale", () => {
    const { set, show, doc, wb, sheetId } = setup("pt");
    set("A1", "1234,5");
    expect(show("A1")).toBe("1234,5");
    const sheet = wb.sheet(sheetId)!;
    doc.transact(() => sheetCells(sheet.map).set(cellKey(sheet.rows[0], sheet.cols[0]), { v: 1234.5, s: { nf: "#,##0.00 €" } }));
    expect(show("A1")).toBe("1.234,50 €");
  });

  it("shifts relative references when copying", () => {
    expect(shiftFormula("A1+$B$2+B$3+$C4", 1, 1)).toBe("B2+$B$2+C$3+$C5");
    expect(shiftFormula("SUM(A1:A3)", 0, 2)).toBe("SUM(C1:C3)");
    expect(shiftFormula("A1", -1, 0)).toBe("#REF!");
  });

  it("sorts a range by moving contents, keeping outside references", () => {
    const { set, get, edit, wb, sheetId } = setup();
    set("A1", "Pão");
    set("B1", "0.8");
    set("A2", "Água");
    set("B2", "0.5");
    set("A3", "Café");
    set("B3", "1.5");
    set("C1", "=B1*2");
    set("C2", "=B2*2");
    set("C3", "=B3*2");
    set("E1", "=SUM(B1:B3)");
    set("E2", "=A1");
    sortRange(wb, sheetId, { r1: 0, c1: 0, r2: 2, c2: 2 }, 1, true);
    expect([get("A1"), get("A2"), get("A3")]).toEqual(["Água", "Pão", "Café"]);
    // Formulas inside the range moved with their row and still point at it.
    expect(edit("C1")).toBe("=B1*2");
    expect(get("C1")).toBe(1);
    // References from outside keep their cells.
    expect(edit("E1")).toBe("=SUM(B1:B3)");
    expect(get("E1")).toBeCloseTo(2.8);
    expect(get("E2")).toBe("Água");
  });

  it("replaces a workbook with another document's content", () => {
    const source = setup();
    source.set("A1", "Olá");
    source.set("B1", "=A1");
    const target = setup();
    target.set("A1", "old");
    replaceWorkbook(target.doc, source.doc);
    expect(target.wb.sheets().map((s) => s.name)).toEqual(["Sheet1"]);
    const id = target.wb.sheets()[0].id;
    expect(target.get("A1", id)).toBe("Olá");
    expect(target.edit("B1", id)).toBe("=A1");
  });
});
