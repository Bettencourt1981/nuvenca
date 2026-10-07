"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  ChartColumn,
  Filter,
  Grid2x2,
  Italic,
  Merge,
  MessageSquarePlus,
  PaintBucket,
  Percent,
  Printer,
  Redo2,
  Sigma,
  Strikethrough,
  Underline,
  Undo2,
  Euro,
  WrapText,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownContent, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { NUMBER_FORMATS } from "@/lib/editors/sheets/format";
import type { BorderMode } from "@/lib/editors/sheets/ops";
import type { CellStyle, HAlign, VAlign } from "@/lib/editors/sheets/model";
import { cn } from "@/lib/utils";

const COLORS = [
  "#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#cccccc", "#efefef", "#ffffff",
  "#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#4a86e8", "#0000ff",
  "#e6b8af", "#f4cccc", "#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3", "#c9daf8", "#cfe2f3",
  "#a61c00", "#cc0000", "#e69138", "#f1c232", "#6aa84f", "#45818e", "#3c78d8", "#3d85c6",
];
const FONTS = ["Arial", "Calibri", "Georgia", "Times New Roman", "Courier New", "Verdana"];
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 18, 24, 36];

export type SheetCommand =
  | { type: "undo" }
  | { type: "redo" }
  | { type: "print" }
  | { type: "style"; values: Partial<CellStyle> }
  | { type: "toggle"; key: "b" | "i" | "u" | "st" | "wrap" }
  | { type: "format"; pattern: string }
  | { type: "decimals"; delta: 1 | -1 }
  | { type: "borders"; mode: BorderMode }
  | { type: "merge" }
  | { type: "function"; name: string }
  | { type: "chart" }
  | { type: "filter" }
  | { type: "comment" }
  | { type: "clearFormatting" };

function Tool({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
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
        "flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md px-1 text-foreground hover:bg-surface-hover disabled:opacity-40 [&>svg]:size-[18px]",
        active && "bg-primary-soft text-primary",
      )}
    >
      {children}
    </button>
  );
}

const Separator = () => <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />;

function ColorTool({ label, icon, current, onPick }: { label: string; icon: ReactNode; current?: string; onPick: (color: string | undefined) => void }) {
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
      <PopoverContent onOpenAutoFocus={(event) => event.preventDefault()} onCloseAutoFocus={(event) => event.preventDefault()} className="w-64">
        <div className="grid grid-cols-8 gap-1">
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={color}
              onClick={() => {
                onPick(color);
                setOpen(false);
              }}
              className="size-6 rounded-full border border-border"
              style={{ background: color }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            onPick(undefined);
            setOpen(false);
          }}
          className="mt-2 w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-hover"
        >
          {t("noColor")}
        </button>
      </PopoverContent>
    </Popover>
  );
}

export function SheetsToolbar({
  style,
  canUndo,
  canRedo,
  hasFilter,
  merged,
  onCommand,
}: {
  style: CellStyle;
  canUndo: boolean;
  canRedo: boolean;
  hasFilter: boolean;
  merged: boolean;
  onCommand: (command: SheetCommand) => void;
}) {
  const t = useTranslations("editor.sheets");
  const d = useTranslations("editor.docs");
  const run = (command: SheetCommand) => () => onCommand(command);
  const align = style.ha ?? "left";
  const AlignIcon = align === "center" ? AlignCenter : align === "right" ? AlignRight : AlignLeft;

  return (
    <div
      role="toolbar"
      aria-label={d("toolbar")}
      className="no-print flex items-center gap-0.5 overflow-x-auto border-b border-border bg-surface px-2 py-1.5 [scrollbar-width:thin]"
    >
      <Tool label={d("undo")} onClick={run({ type: "undo" })} disabled={!canUndo}>
        <Undo2 />
      </Tool>
      <Tool label={d("redo")} onClick={run({ type: "redo" })} disabled={!canRedo}>
        <Redo2 />
      </Tool>
      <Tool label={d("print")} onClick={run({ type: "print" })}>
        <Printer />
      </Tool>
      <Separator />

      <Tool label={t("formats.euro")} onClick={run({ type: "format", pattern: NUMBER_FORMATS.euro })}>
        <Euro />
      </Tool>
      <Tool label={t("formats.percent")} onClick={run({ type: "format", pattern: NUMBER_FORMATS.percent })}>
        <Percent />
      </Tool>
      <Tool label={t("decreaseDecimals")} onClick={run({ type: "decimals", delta: -1 })}>
        <span className="text-xs font-semibold">.0←</span>
      </Tool>
      <Tool label={t("increaseDecimals")} onClick={run({ type: "decimals", delta: 1 })}>
        <span className="text-xs font-semibold">.00→</span>
      </Tool>
      <DropdownMenu>
        <DropdownTrigger asChild>
          <button
            type="button"
            title={t("moreFormats")}
            className="h-8 shrink-0 rounded-md px-2 text-sm font-semibold hover:bg-surface-hover"
            onMouseDown={(event) => event.preventDefault()}
          >
            123
          </button>
        </DropdownTrigger>
        <DropdownContent align="start" onCloseAutoFocus={(event) => event.preventDefault()}>
          {(Object.keys(NUMBER_FORMATS) as (keyof typeof NUMBER_FORMATS)[]).map((key) => (
            <DropdownItem key={key} onSelect={run({ type: "format", pattern: NUMBER_FORMATS[key] })}>
              <span className="flex-1">{t(`formats.${key}`)}</span>
              <span className="text-xs text-muted">{NUMBER_FORMATS[key]}</span>
            </DropdownItem>
          ))}
        </DropdownContent>
      </DropdownMenu>
      <Separator />

      <select
        aria-label={d("font")}
        value={style.ff ?? "Arial"}
        onChange={(event) => onCommand({ type: "style", values: { ff: event.target.value === "Arial" ? undefined : event.target.value } })}
        className="h-8 w-28 shrink-0 rounded-md bg-transparent px-1 text-sm hover:bg-surface-hover focus:outline-none"
      >
        {FONTS.map((font) => (
          <option key={font} value={font}>
            {font}
          </option>
        ))}
      </select>
      <select
        aria-label={d("fontSize")}
        value={style.fs ?? 10}
        onChange={(event) => onCommand({ type: "style", values: { fs: Number(event.target.value) === 10 ? undefined : Number(event.target.value) } })}
        className="h-8 w-14 shrink-0 rounded-md bg-transparent px-1 text-sm hover:bg-surface-hover focus:outline-none"
      >
        {FONT_SIZES.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
      <Separator />

      <Tool label={d("bold")} active={!!style.b} onClick={run({ type: "toggle", key: "b" })}>
        <Bold />
      </Tool>
      <Tool label={d("italic")} active={!!style.i} onClick={run({ type: "toggle", key: "i" })}>
        <Italic />
      </Tool>
      <Tool label={d("underline")} active={!!style.u} onClick={run({ type: "toggle", key: "u" })}>
        <Underline />
      </Tool>
      <Tool label={d("strike")} active={!!style.st} onClick={run({ type: "toggle", key: "st" })}>
        <Strikethrough />
      </Tool>
      <ColorTool label={d("textColor")} icon={<Baseline />} current={style.fc} onPick={(fc) => onCommand({ type: "style", values: { fc } })} />
      <Separator />

      <ColorTool label={t("fillColor")} icon={<PaintBucket />} current={style.bg} onPick={(bg) => onCommand({ type: "style", values: { bg } })} />
      <DropdownMenu>
        <DropdownTrigger asChild>
          <button
            type="button"
            title={t("borders.label")}
            aria-label={t("borders.label")}
            className="flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-surface-hover [&>svg]:size-[18px]"
            onMouseDown={(event) => event.preventDefault()}
          >
            <Grid2x2 />
          </button>
        </DropdownTrigger>
        <DropdownContent align="start" onCloseAutoFocus={(event) => event.preventDefault()}>
          {(["all", "outer", "inner", "top", "bottom", "left", "right", "none"] as BorderMode[]).map((mode) => (
            <DropdownItem key={mode} onSelect={run({ type: "borders", mode })}>
              {t(`borders.${mode}`)}
            </DropdownItem>
          ))}
        </DropdownContent>
      </DropdownMenu>
      <Tool label={merged ? t("unmerge") : t("merge")} active={merged} onClick={run({ type: "merge" })}>
        <Merge />
      </Tool>
      <Separator />

      <DropdownMenu>
        <DropdownTrigger asChild>
          <button
            type="button"
            title={t("horizontalAlign")}
            aria-label={t("horizontalAlign")}
            className="flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-surface-hover [&>svg]:size-[18px]"
            onMouseDown={(event) => event.preventDefault()}
          >
            <AlignIcon />
          </button>
        </DropdownTrigger>
        <DropdownContent align="start" onCloseAutoFocus={(event) => event.preventDefault()}>
          {(["left", "center", "right"] as HAlign[]).map((value) => (
            <DropdownItem key={value} onSelect={run({ type: "style", values: { ha: value } })}>
              {t(`align.${value}`)}
            </DropdownItem>
          ))}
          <DropdownSeparator />
          {(["top", "middle", "bottom"] as VAlign[]).map((value) => (
            <DropdownItem key={value} onSelect={run({ type: "style", values: { va: value } })}>
              {t(`align.${value}`)}
            </DropdownItem>
          ))}
        </DropdownContent>
      </DropdownMenu>
      <Tool label={t("wrap")} active={!!style.wrap} onClick={run({ type: "toggle", key: "wrap" })}>
        <WrapText />
      </Tool>
      <Separator />

      <Tool label={d("addComment")} onClick={run({ type: "comment" })}>
        <MessageSquarePlus />
      </Tool>
      <Tool label={t("insertChart")} onClick={run({ type: "chart" })}>
        <ChartColumn />
      </Tool>
      <Tool label={hasFilter ? t("removeFilter") : t("createFilter")} active={hasFilter} onClick={run({ type: "filter" })}>
        <Filter />
      </Tool>
      <DropdownMenu>
        <DropdownTrigger asChild>
          <button
            type="button"
            title={t("functions")}
            aria-label={t("functions")}
            className="flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-surface-hover [&>svg]:size-[18px]"
            onMouseDown={(event) => event.preventDefault()}
          >
            <Sigma />
          </button>
        </DropdownTrigger>
        <DropdownContent align="end" onCloseAutoFocus={(event) => event.preventDefault()}>
          {["SUM", "AVERAGE", "COUNT", "MAX", "MIN"].map((name) => (
            <DropdownItem key={name} onSelect={run({ type: "function", name })}>
              <span className="font-mono text-xs">{name}</span>
            </DropdownItem>
          ))}
        </DropdownContent>
      </DropdownMenu>
    </div>
  );
}
