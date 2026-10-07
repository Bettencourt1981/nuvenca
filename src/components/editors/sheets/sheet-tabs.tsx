"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Plus } from "lucide-react";
import { DropdownContent, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";

export function SheetTabs({
  sheets,
  activeId,
  readOnly,
  onSelect,
  onAdd,
  onRename,
  onDuplicate,
  onDelete,
  onMove,
}: {
  sheets: { id: string; name: string; color?: string }[];
  activeId: string;
  readOnly: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, index: number) => void;
}) {
  const t = useTranslations("editor.sheets.tabs");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const commit = () => {
    if (renaming && draft.trim()) onRename(renaming, draft.trim().slice(0, 100));
    setRenaming(null);
  };

  return (
    <div className="no-print flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-t border-border bg-surface-muted px-2">
      {!readOnly ? (
        <button
          type="button"
          onClick={onAdd}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground"
          aria-label={t("add")}
          title={t("add")}
        >
          <Plus className="size-4" />
        </button>
      ) : null}
      {sheets.map((sheet, index) => {
        const active = sheet.id === activeId;
        if (renaming === sheet.id) {
          return (
            <input
              key={sheet.id}
              autoFocus
              value={draft}
              aria-label={t("rename")}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === "Enter") commit();
                if (event.key === "Escape") setRenaming(null);
              }}
              className="h-8 w-32 shrink-0 rounded-md border border-primary bg-surface px-2 text-sm focus:outline-none"
            />
          );
        }
        return (
          <div
            key={sheet.id}
            className={cn(
              "flex h-8 shrink-0 items-center rounded-md text-sm",
              active ? "bg-surface font-medium text-primary shadow-sm" : "text-foreground hover:bg-surface-hover",
            )}
            style={sheet.color ? { boxShadow: `inset 0 -3px 0 ${sheet.color}` } : undefined}
          >
            <button
              type="button"
              onClick={() => onSelect(sheet.id)}
              onDoubleClick={() => {
                if (readOnly) return;
                setDraft(sheet.name);
                setRenaming(sheet.id);
              }}
              className="h-full max-w-48 truncate pl-3 pr-1"
              aria-current={active ? "page" : undefined}
            >
              {sheet.name}
            </button>
            {!readOnly ? (
              <DropdownMenu>
                <DropdownTrigger className="flex h-full items-center pr-2 text-muted" aria-label={t("options", { name: sheet.name })}>
                  <ChevronDown className="size-3.5" />
                </DropdownTrigger>
                <DropdownContent align="start" side="top">
                  <DropdownItem
                    onSelect={() => {
                      setDraft(sheet.name);
                      setRenaming(sheet.id);
                    }}
                  >
                    {t("rename")}
                  </DropdownItem>
                  <DropdownItem onSelect={() => onDuplicate(sheet.id)}>{t("duplicate")}</DropdownItem>
                  <DropdownSeparator />
                  <DropdownItem disabled={index === 0} onSelect={() => onMove(sheet.id, index - 1)}>
                    {t("moveLeft")}
                  </DropdownItem>
                  <DropdownItem disabled={index === sheets.length - 1} onSelect={() => onMove(sheet.id, index + 1)}>
                    {t("moveRight")}
                  </DropdownItem>
                  <DropdownSeparator />
                  <DropdownItem danger disabled={sheets.length <= 1} onSelect={() => onDelete(sheet.id)}>
                    {t("delete")}
                  </DropdownItem>
                </DropdownContent>
              </DropdownMenu>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
