"use client";

import { useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useEditorState, type Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Highlighter,
  ImagePlus,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  MessageSquarePlus,
  Minus,
  Plus,
  Printer,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Table as TableIcon,
  Underline,
  Undo2,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export const FONT_FAMILIES = [
  { label: "Default", value: "" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Calibri", value: "Calibri, Carlito, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Courier New", value: "'Courier New', Courier, monospace" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
];

export const DEFAULT_FONT_SIZE = 11;

const TEXT_COLORS = [
  "#000000", "#434343", "#666666", "#999999", "#cccccc", "#ffffff",
  "#c00000", "#e06666", "#e69138", "#f1c232", "#6aa84f", "#45818e",
  "#3c78d8", "#3d85c6", "#674ea7", "#a64d79", "#0b5394", "#38761d",
];
const HIGHLIGHT_COLORS = ["#fff2cc", "#fce5cd", "#f4cccc", "#d9ead3", "#d0e0e3", "#cfe2f3", "#d9d2e9", "#ead1dc", "#ffff00", "#00ffff"];

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-surface-hover disabled:opacity-40 [&>svg]:size-[18px]",
        active && "bg-primary-soft text-primary",
      )}
    >
      {children}
    </button>
  );
}

function Separator() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />;
}

function ColorPicker({
  label,
  icon,
  colors,
  current,
  onPick,
  onClear,
}: {
  label: string;
  icon: ReactNode;
  colors: string[];
  current: string | null;
  onPick: (color: string) => void;
  onClear: () => void;
}) {
  const t = useTranslations("editor.docs");
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={label}
          aria-label={label}
          onMouseDown={(event) => event.preventDefault()}
          className="relative flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-surface-hover [&>svg]:size-[18px]"
        >
          {icon}
          <span className="absolute bottom-1 left-2 right-2 h-[3px] rounded" style={{ background: current ?? "transparent" }} />
        </button>
      </PopoverTrigger>
      <PopoverContent onOpenAutoFocus={(event) => event.preventDefault()} className="w-56">
        <div className="grid grid-cols-6 gap-1.5">
          {colors.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => {
                onPick(color);
                setOpen(false);
              }}
              className="size-7 rounded-full border border-border"
              style={{ background: color }}
              aria-label={color}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            onClear();
            setOpen(false);
          }}
          className="mt-3 w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-hover"
        >
          {t("noColor")}
        </button>
      </PopoverContent>
    </Popover>
  );
}

function TablePicker({ onInsert, label }: { onInsert: (rows: number, cols: number) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState({ rows: 0, cols: 0 });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={label}
          aria-label={label}
          onMouseDown={(event) => event.preventDefault()}
          className="flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-surface-hover [&>svg]:size-[18px]"
        >
          <TableIcon />
        </button>
      </PopoverTrigger>
      <PopoverContent onOpenAutoFocus={(event) => event.preventDefault()}>
        <div className="grid grid-cols-8 gap-1" onMouseLeave={() => setHover({ rows: 0, cols: 0 })}>
          {Array.from({ length: 8 * 8 }, (_, index) => {
            const row = Math.floor(index / 8) + 1;
            const col = (index % 8) + 1;
            const active = row <= hover.rows && col <= hover.cols;
            return (
              <button
                key={index}
                type="button"
                aria-label={`${row} × ${col}`}
                onMouseEnter={() => setHover({ rows: row, cols: col })}
                onFocus={() => setHover({ rows: row, cols: col })}
                onClick={() => {
                  onInsert(row, col);
                  setOpen(false);
                }}
                className={cn("size-4 rounded-sm border", active ? "border-primary bg-primary-soft" : "border-border")}
              />
            );
          })}
        </div>
        <p className="mt-2 text-center text-xs text-muted">
          {hover.rows > 0 ? `${hover.rows} × ${hover.cols}` : label}
        </p>
      </PopoverContent>
    </Popover>
  );
}

export function DocsToolbar({
  editor,
  canEdit,
  canComment,
  onLink,
  onImage,
  onComment,
}: {
  editor: Editor;
  canEdit: boolean;
  canComment: boolean;
  onLink: () => void;
  onImage: (file: File) => void;
  onComment: () => void;
}) {
  const t = useTranslations("editor.docs");
  const imageInput = useRef<HTMLInputElement>(null);

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const textStyle = e.getAttributes("textStyle");
      return {
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
        block: e.isActive("heading", { level: 1 })
          ? "h1"
          : e.isActive("heading", { level: 2 })
            ? "h2"
            : e.isActive("heading", { level: 3 })
              ? "h3"
              : e.isActive("heading", { level: 4 })
                ? "h4"
                : "p",
        fontFamily: (textStyle.fontFamily as string | undefined) ?? "",
        fontSize: parseFloat(String(textStyle.fontSize ?? "")) || DEFAULT_FONT_SIZE,
        color: (textStyle.color as string | undefined) ?? null,
        highlight: (e.getAttributes("highlight").color as string | undefined) ?? null,
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        underline: e.isActive("underline"),
        strike: e.isActive("strike"),
        link: e.isActive("link"),
        align: (["left", "center", "right", "justify"] as const).find((a) => e.isActive({ textAlign: a })) ?? "left",
        bulletList: e.isActive("bulletList"),
        orderedList: e.isActive("orderedList"),
        taskList: e.isActive("taskList"),
        inList: e.isActive("listItem") || e.isActive("taskItem"),
        hasSelection: !e.state.selection.empty,
      };
    },
  });

  const chain = () => editor.chain().focus();
  const listItemType = editor.isActive("taskItem") ? "taskItem" : "listItem";
  const setFontSize = (size: number) => {
    const clamped = Math.min(400, Math.max(1, Math.round(size)));
    chain().setFontSize(`${clamped}pt`).run();
  };

  if (!canEdit) {
    return canComment ? (
      <div className="no-print flex items-center gap-1 border-b border-border bg-surface px-3 py-1.5">
        <ToolButton label={t("addComment")} onClick={onComment} disabled={!state.hasSelection}>
          <MessageSquarePlus />
        </ToolButton>
        <span className="text-xs text-muted">{t("commentOnlyHint")}</span>
      </div>
    ) : null;
  }

  return (
    <div
      role="toolbar"
      aria-label={t("toolbar")}
      className="no-print flex items-center gap-0.5 overflow-x-auto border-b border-border bg-surface px-2 py-1.5 [scrollbar-width:thin]"
    >
      <ToolButton label={t("undo")} onClick={() => chain().undo().run()} disabled={!state.canUndo}>
        <Undo2 />
      </ToolButton>
      <ToolButton label={t("redo")} onClick={() => chain().redo().run()} disabled={!state.canRedo}>
        <Redo2 />
      </ToolButton>
      <ToolButton label={t("print")} onClick={() => window.print()}>
        <Printer />
      </ToolButton>
      <Separator />

      <select
        aria-label={t("textStyle")}
        value={state.block}
        onChange={(event) => {
          const value = event.target.value;
          if (value === "p") chain().setParagraph().run();
          else chain().setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 | 4 }).run();
        }}
        className="h-8 shrink-0 rounded-md bg-transparent px-1 text-sm hover:bg-surface-hover focus:outline-none"
      >
        <option value="p">{t("normalText")}</option>
        <option value="h1">{t("heading", { level: 1 })}</option>
        <option value="h2">{t("heading", { level: 2 })}</option>
        <option value="h3">{t("heading", { level: 3 })}</option>
        <option value="h4">{t("heading", { level: 4 })}</option>
      </select>
      <Separator />

      <select
        aria-label={t("font")}
        value={FONT_FAMILIES.some((f) => f.value === state.fontFamily) ? state.fontFamily : ""}
        onChange={(event) => {
          const value = event.target.value;
          if (value) chain().setFontFamily(value).run();
          else chain().unsetFontFamily().run();
        }}
        className="h-8 w-28 shrink-0 rounded-md bg-transparent px-1 text-sm hover:bg-surface-hover focus:outline-none"
      >
        {FONT_FAMILIES.map((font) => (
          <option key={font.label} value={font.value}>
            {font.value ? font.label : t("defaultFont")}
          </option>
        ))}
      </select>
      <Separator />

      <ToolButton label={t("decreaseFontSize")} onClick={() => setFontSize(state.fontSize - 1)}>
        <Minus />
      </ToolButton>
      <input
        key={state.fontSize}
        aria-label={t("fontSize")}
        defaultValue={state.fontSize}
        inputMode="numeric"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            const value = Number(event.currentTarget.value);
            if (value > 0) setFontSize(value);
          }
        }}
        onBlur={(event) => {
          const value = Number(event.currentTarget.value);
          if (value > 0 && value !== state.fontSize) setFontSize(value);
        }}
        className="h-7 w-10 shrink-0 rounded-md border border-border bg-transparent text-center text-sm focus:border-primary focus:outline-none"
      />
      <ToolButton label={t("increaseFontSize")} onClick={() => setFontSize(state.fontSize + 1)}>
        <Plus />
      </ToolButton>
      <Separator />

      <ToolButton label={t("bold")} active={state.bold} onClick={() => chain().toggleBold().run()}>
        <Bold />
      </ToolButton>
      <ToolButton label={t("italic")} active={state.italic} onClick={() => chain().toggleItalic().run()}>
        <Italic />
      </ToolButton>
      <ToolButton label={t("underline")} active={state.underline} onClick={() => chain().toggleUnderline().run()}>
        <Underline />
      </ToolButton>
      <ToolButton label={t("strike")} active={state.strike} onClick={() => chain().toggleStrike().run()}>
        <Strikethrough />
      </ToolButton>
      <ColorPicker
        label={t("textColor")}
        icon={<Baseline />}
        colors={TEXT_COLORS}
        current={state.color}
        onPick={(color) => chain().setColor(color).run()}
        onClear={() => chain().unsetColor().run()}
      />
      <ColorPicker
        label={t("highlight")}
        icon={<Highlighter />}
        colors={HIGHLIGHT_COLORS}
        current={state.highlight}
        onPick={(color) => chain().setHighlight({ color }).run()}
        onClear={() => chain().unsetHighlight().run()}
      />
      <Separator />

      <ToolButton label={t("link")} active={state.link} onClick={onLink}>
        <Link2 />
      </ToolButton>
      <ToolButton label={t("addComment")} onClick={onComment} disabled={!state.hasSelection || !canComment}>
        <MessageSquarePlus />
      </ToolButton>
      <ToolButton label={t("image")} onClick={() => imageInput.current?.click()}>
        <ImagePlus />
      </ToolButton>
      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onImage(file);
          event.target.value = "";
        }}
      />
      <TablePicker label={t("insertTable")} onInsert={(rows, cols) => chain().insertTable({ rows, cols, withHeaderRow: false }).run()} />
      <Separator />

      <ToolButton label={t("alignLeft")} active={state.align === "left"} onClick={() => chain().setTextAlign("left").run()}>
        <AlignLeft />
      </ToolButton>
      <ToolButton label={t("alignCenter")} active={state.align === "center"} onClick={() => chain().setTextAlign("center").run()}>
        <AlignCenter />
      </ToolButton>
      <ToolButton label={t("alignRight")} active={state.align === "right"} onClick={() => chain().setTextAlign("right").run()}>
        <AlignRight />
      </ToolButton>
      <ToolButton label={t("justify")} active={state.align === "justify"} onClick={() => chain().setTextAlign("justify").run()}>
        <AlignJustify />
      </ToolButton>
      <Separator />

      <ToolButton label={t("checklist")} active={state.taskList} onClick={() => chain().toggleTaskList().run()}>
        <ListTodo />
      </ToolButton>
      <ToolButton label={t("bulletList")} active={state.bulletList} onClick={() => chain().toggleBulletList().run()}>
        <List />
      </ToolButton>
      <ToolButton label={t("numberedList")} active={state.orderedList} onClick={() => chain().toggleOrderedList().run()}>
        <ListOrdered />
      </ToolButton>
      <ToolButton label={t("outdent")} disabled={!state.inList} onClick={() => chain().liftListItem(listItemType).run()}>
        <IndentDecrease />
      </ToolButton>
      <ToolButton label={t("indent")} disabled={!state.inList} onClick={() => chain().sinkListItem(listItemType).run()}>
        <IndentIncrease />
      </ToolButton>
      <Separator />
      <ToolButton label={t("clearFormatting")} onClick={() => chain().unsetAllMarks().clearNodes().run()}>
        <RemoveFormatting />
      </ToolButton>
    </div>
  );
}
