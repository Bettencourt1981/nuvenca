import "server-only";
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IRunOptions,
  type ParagraphChild,
} from "docx";

/** A ProseMirror JSON node (as produced by the editor). */
type PMNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
};

export type ImageLoader = (src: string) => Promise<{ data: Uint8Array; type: "png" | "jpg" | "gif" | "bmp" } | null>;

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];
const ALIGN: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};
const MAX_IMAGE_WIDTH = 600; // px, fits an A4 page with 2.5 cm margins

function hex(color: unknown): string | undefined {
  if (typeof color !== "string") return undefined;
  const value = color.trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
  if (short) return `${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toUpperCase();
  const long = /^#([0-9a-f]{6})$/i.exec(value);
  if (long) return long[1].toUpperCase();
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(value);
  if (rgb) return [rgb[1], rgb[2], rgb[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("").toUpperCase();
  return undefined;
}

/** "12pt" / "16px" → half-points */
function halfPoints(size: unknown): number | undefined {
  if (typeof size !== "string") return undefined;
  const value = parseFloat(size);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const points = size.endsWith("px") ? value * 0.75 : value;
  return Math.round(points * 2);
}

function firstFont(family: unknown): string | undefined {
  if (typeof family !== "string" || !family) return undefined;
  return family.split(",")[0].replace(/['"]/g, "").trim() || undefined;
}

/** Width and height of PNG, JPEG, GIF or BMP data, in pixels. */
function imageSize(data: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data[0] === 0x89 && data[1] === 0x50) return { width: view.getUint32(16), height: view.getUint32(20) };
  if (data[0] === 0x47 && data[1] === 0x49) return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  if (data[0] === 0x42 && data[1] === 0x4d) return { width: view.getInt32(18, true), height: Math.abs(view.getInt32(22, true)) };
  if (data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2;
    while (offset < data.length) {
      if (data[offset] !== 0xff) return null;
      const marker = data[offset + 1];
      const length = view.getUint16(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
      }
      offset += 2 + length;
    }
  }
  return null;
}

type BlockContext = { listLevel?: number; quote?: boolean };

class Converter {
  private orderedLists = 0;
  constructor(private loadImage: ImageLoader) {}

  async blocks(nodes: PMNode[] = [], context: BlockContext = {}): Promise<(Paragraph | Table)[]> {
    const out: (Paragraph | Table)[] = [];
    for (const node of nodes) out.push(...(await this.block(node, context)));
    return out;
  }

  private async block(node: PMNode, context: BlockContext): Promise<(Paragraph | Table)[]> {
    const attrs = node.attrs ?? {};
    const alignment = ALIGN[String(attrs.textAlign ?? "")];
    // Quotes are drawn as an indented paragraph with a left border.
    const quote = context.quote
      ? {
          indent: { left: 720 },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: "D0D7E2", space: 8 } },
        }
      : {};
    switch (node.type) {
      case "paragraph":
        return [new Paragraph({ children: await this.inline(node.content), alignment, ...quote })];
      case "heading": {
        const level = Math.min(Math.max(Number(attrs.level) || 1, 1), 4);
        return [new Paragraph({ children: await this.inline(node.content), heading: HEADINGS[level - 1], alignment, ...quote })];
      }
      case "blockquote":
        return this.blocks(node.content, { ...context, quote: true });
      case "codeBlock": {
        const lines = (node.content ?? []).map((t) => t.text ?? "").join("").split("\n");
        return [
          new Paragraph({
            shading: { type: ShadingType.CLEAR, fill: "F4F6F9", color: "auto" },
            children: lines.map(
              (line, index) => new TextRun({ text: line, font: "Courier New", size: 20, break: index > 0 ? 1 : undefined }),
            ),
          }),
        ];
      }
      case "horizontalRule":
        return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "C9CED8", space: 1 } } })];
      case "bulletList":
      case "orderedList":
      case "taskList":
        return this.list(node, context.listLevel ?? 0);
      case "image":
        return [new Paragraph({ children: await this.image(attrs), alignment })];
      case "table":
        return [await this.table(node)];
      default:
        return node.content ? this.blocks(node.content, context) : [];
    }
  }

  private async list(node: PMNode, level: number): Promise<(Paragraph | Table)[]> {
    const out: (Paragraph | Table)[] = [];
    const instance = node.type === "orderedList" ? ++this.orderedLists : 0;
    for (const item of node.content ?? []) {
      const [first, ...rest] = item.content ?? [];
      const checked = item.attrs?.checked === true;
      const prefix = node.type === "taskList" ? [new TextRun({ text: checked ? "☒ " : "☐ " })] : [];
      const runs = first ? await this.inline(first.content) : [];
      out.push(
        new Paragraph({
          children: [...prefix, ...runs],
          ...(node.type === "bulletList"
            ? { bullet: { level: Math.min(level, 8) } }
            : node.type === "orderedList"
              ? { numbering: { reference: "ordered", level: Math.min(level, 8), instance } }
              : { indent: { left: 360 * (level + 1) } }),
        }),
      );
      for (const child of rest) {
        if (child.type === "bulletList" || child.type === "orderedList" || child.type === "taskList") {
          out.push(...(await this.list(child, level + 1)));
        } else {
          out.push(...(await this.blocks([child], { listLevel: level + 1 })));
        }
      }
    }
    return out;
  }

  private async table(node: PMNode): Promise<Table> {
    const rows = await Promise.all(
      (node.content ?? []).map(
        async (row) =>
          new TableRow({
            children: await Promise.all(
              (row.content ?? []).map(async (cell) => {
                const header = cell.type === "tableHeader";
                const children = (await this.blocks(cell.content)).filter((b): b is Paragraph => b instanceof Paragraph);
                return new TableCell({
                  children: children.length ? children : [new Paragraph({})],
                  columnSpan: Number(cell.attrs?.colspan) > 1 ? Number(cell.attrs?.colspan) : undefined,
                  rowSpan: Number(cell.attrs?.rowspan) > 1 ? Number(cell.attrs?.rowspan) : undefined,
                  shading: header ? { type: ShadingType.CLEAR, fill: "F4F6F9", color: "auto" } : undefined,
                });
              }),
            ),
          }),
      ),
    );
    return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
  }

  private async image(attrs: Record<string, unknown>): Promise<ParagraphChild[]> {
    const src = String(attrs.src ?? "");
    const loaded = src ? await this.loadImage(src).catch(() => null) : null;
    if (!loaded) return [new TextRun({ text: String(attrs.alt ?? ""), italics: true })];
    const size = imageSize(loaded.data) ?? { width: 400, height: 300 };
    const scale = Math.min(1, MAX_IMAGE_WIDTH / size.width);
    return [
      new ImageRun({
        type: loaded.type,
        data: loaded.data,
        transformation: { width: Math.round(size.width * scale), height: Math.round(size.height * scale) },
        altText: { name: String(attrs.alt ?? "image"), description: String(attrs.alt ?? ""), title: String(attrs.title ?? "") },
      }),
    ];
  }

  private async inline(nodes: PMNode[] = []): Promise<ParagraphChild[]> {
    const out: ParagraphChild[] = [];
    for (const node of nodes) {
      if (node.type === "hardBreak") {
        out.push(new TextRun({ text: "", break: 1 }));
        continue;
      }
      if (node.type === "image") {
        out.push(...(await this.image(node.attrs ?? {})));
        continue;
      }
      if (node.type !== "text" || !node.text) continue;
      const options: IRunOptions & { style?: string } = { text: node.text };
      let href: string | null = null;
      for (const mark of node.marks ?? []) {
        const a = mark.attrs ?? {};
        switch (mark.type) {
          case "bold":
            Object.assign(options, { bold: true });
            break;
          case "italic":
            Object.assign(options, { italics: true });
            break;
          case "underline":
            Object.assign(options, { underline: {} });
            break;
          case "strike":
            Object.assign(options, { strike: true });
            break;
          case "code":
            Object.assign(options, { font: "Courier New" });
            break;
          case "superscript":
            Object.assign(options, { superScript: true });
            break;
          case "subscript":
            Object.assign(options, { subScript: true });
            break;
          case "highlight": {
            const fill = hex(a.color) ?? "FFF2CC";
            Object.assign(options, { shading: { type: ShadingType.CLEAR, fill, color: "auto" } });
            break;
          }
          case "textStyle": {
            const color = hex(a.color);
            const size = halfPoints(a.fontSize);
            const font = firstFont(a.fontFamily);
            const background = hex(a.backgroundColor);
            if (color) Object.assign(options, { color });
            if (size) Object.assign(options, { size });
            if (font) Object.assign(options, { font });
            if (background) Object.assign(options, { shading: { type: ShadingType.CLEAR, fill: background, color: "auto" } });
            break;
          }
          case "link":
            href = typeof a.href === "string" ? a.href : null;
            break;
        }
      }
      if (href && /^(https?:|mailto:|tel:)/i.test(href)) {
        out.push(
          new ExternalHyperlink({ link: href, children: [new TextRun({ ...options, style: "Hyperlink", color: "1155CC", underline: {} })] }),
        );
      } else {
        out.push(new TextRun(options));
      }
    }
    return out;
  }
}

/** Build a .docx file from the editor's JSON. */
export async function documentToDocx(json: PMNode, loadImage: ImageLoader): Promise<Uint8Array> {
  const converter = new Converter(loadImage);
  const children = await converter.blocks(json.content);
  const levels = ["%1.", "%2.", "%3.", "%4.", "%5.", "%6.", "%7.", "%8.", "%9."].map((text, level) => ({
    level,
    format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level % 3],
    text,
    alignment: AlignmentType.START,
    style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
  }));
  const document = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
    numbering: { config: [{ reference: "ordered", levels }] },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        children: children.length ? children : [new Paragraph({})],
      },
    ],
  });
  const buffer = await Packer.toBuffer(document);
  return new Uint8Array(buffer);
}
