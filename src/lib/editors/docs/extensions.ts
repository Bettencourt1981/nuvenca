import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { TableKit } from "@tiptap/extension-table";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";

/**
 * The document schema, shared by the editor, the Word import/export and the
 * read-only viewer so they always agree on what a document can contain.
 * Undo/redo comes from the collaboration extension, so it is off here.
 */
export function documentExtensions(options: { assetQuery?: string } = {}): Extensions {
  // On public links, embedded images are served with the share token.
  const ImageNode = options.assetQuery
    ? Image.extend({
        renderHTML({ HTMLAttributes }) {
          const src = String(HTMLAttributes.src ?? "");
          const rewritten = src.startsWith("/api/assets/") ? `${src}?${options.assetQuery}` : src;
          return ["img", { ...HTMLAttributes, src: rewritten }];
        },
      })
    : Image;
  return [
    StarterKit.configure({
      undoRedo: false,
      heading: { levels: [1, 2, 3, 4] },
      link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
    }),
    TextStyleKit,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Highlight.configure({ multicolor: true }),
    ImageNode.configure({ inline: false, allowBase64: true }),
    TableKit.configure({ table: { resizable: true } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Subscript,
    Superscript,
  ];
}

/** Yjs fragment that holds the document body. */
export const DOCUMENT_FIELD = "default";
