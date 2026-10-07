"use client";

import { useTranslations } from "next-intl";
import { useEditorState, type Editor } from "@tiptap/react";

/** Row/column actions shown while the cursor is inside a table. */
export function TableBar({ editor }: { editor: Editor }) {
  const t = useTranslations("editor.docs.table");
  const inTable = useEditorState({ editor, selector: ({ editor: e }) => e.isActive("table") });
  if (!inTable) return null;

  const chain = () => editor.chain().focus();
  const actions: [string, () => boolean][] = [
    [t("rowAbove"), () => chain().addRowBefore().run()],
    [t("rowBelow"), () => chain().addRowAfter().run()],
    [t("columnLeft"), () => chain().addColumnBefore().run()],
    [t("columnRight"), () => chain().addColumnAfter().run()],
    [t("deleteRow"), () => chain().deleteRow().run()],
    [t("deleteColumn"), () => chain().deleteColumn().run()],
    [t("mergeOrSplit"), () => chain().mergeOrSplit().run()],
    [t("headerRow"), () => chain().toggleHeaderRow().run()],
    [t("deleteTable"), () => chain().deleteTable().run()],
  ];

  return (
    <div className="no-print flex items-center gap-1 overflow-x-auto border-b border-border bg-surface-muted px-3 py-1" role="toolbar" aria-label={t("label")}>
      <span className="mr-1 shrink-0 text-xs font-medium text-muted">{t("label")}</span>
      {actions.map(([label, run]) => (
        <button
          key={label}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={run}
          className="shrink-0 rounded-md px-2 py-1 text-xs hover:bg-surface-hover"
        >
          {label}
        </button>
      ))}
    </div>
  );
}
