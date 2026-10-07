"use client";

import { useEffect, useState } from "react";
import * as Y from "yjs";
import { EditorContent, useEditor } from "@tiptap/react";
import Collaboration from "@tiptap/extension-collaboration";
import { documentExtensions, DOCUMENT_FIELD } from "@/lib/editors/docs/extensions";
import { fromBase64 } from "@/lib/collab/base64";
import "./document.css";

/** Read-only rendering of a document state (version previews, public links). */
export function DocumentViewer({ state, assetQuery }: { state: Uint8Array | string; assetQuery?: string }) {
  const [doc] = useState(() => {
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, typeof state === "string" ? fromBase64(state) : state);
    return ydoc;
  });
  useEffect(() => () => doc.destroy(), [doc]);

  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions: [...documentExtensions({ assetQuery }), Collaboration.configure({ document: doc, field: DOCUMENT_FIELD })],
    editorProps: { attributes: { class: "doc-content" } },
  });
  return <EditorContent editor={editor} />;
}
