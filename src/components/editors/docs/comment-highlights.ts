import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import * as Y from "yjs";
import {
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
  ySyncPluginKey,
} from "@tiptap/y-tiptap";

/**
 * Comments are stored in the database, not in the document, so commenters
 * (who cannot change the document) can add them too. A thread is anchored
 * with Yjs *relative positions*, which keep pointing at the same text while
 * others edit around it. This extension turns those anchors into highlights.
 */

export type TextAnchor = { from: unknown; to: unknown };
export type HighlightThread = { id: string; anchor: TextAnchor | null; resolved: boolean };

type CommentHighlightsStorage = {
  threads: HighlightThread[];
  activeId: string | null;
  onSelect: ((id: string) => void) | null;
};

declare module "@tiptap/core" {
  interface Storage {
    commentHighlights: CommentHighlightsStorage;
  }
}

const key = new PluginKey("commentHighlights");

function binding(state: EditorState) {
  const sync = ySyncPluginKey.getState(state) as
    | { binding?: { mapping: Map<unknown, unknown> }; doc: Y.Doc; type: Y.XmlFragment }
    | undefined;
  return sync?.binding ? { ...sync, mapping: sync.binding.mapping } : null;
}

/** Turn the current selection into a storable anchor. */
export function selectionAnchor(editor: Editor): { anchor: TextAnchor; quote: string } | null {
  const sync = binding(editor.state);
  const { from, to, empty } = editor.state.selection;
  if (!sync || empty) return null;
  const toJSON = (pos: number) =>
    Y.relativePositionToJSON(absolutePositionToRelativePosition(pos, sync.type, sync.mapping as never));
  return {
    anchor: { from: toJSON(from), to: toJSON(to) },
    quote: editor.state.doc.textBetween(from, to, " ").slice(0, 500),
  };
}

/** Where an anchor currently is in the document, or null if its text is gone. */
export function resolveAnchor(state: EditorState, anchor: TextAnchor | null): { from: number; to: number } | null {
  const sync = binding(state);
  if (!sync || !anchor) return null;
  try {
    const toAbs = (json: unknown) =>
      relativePositionToAbsolutePosition(
        sync.doc,
        sync.type,
        Y.createRelativePositionFromJSON(json),
        sync.mapping as never,
      );
    const from = toAbs(anchor.from);
    const to = toAbs(anchor.to);
    if (from === null || to === null || to <= from) return null;
    return { from, to };
  } catch {
    return null;
  }
}

export const CommentHighlights = Extension.create<object, CommentHighlightsStorage>({
  name: "commentHighlights",

  addStorage() {
    return { threads: [], activeId: null, onSelect: null };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    return [
      new Plugin({
        key,
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            for (const thread of storage.threads) {
              if (thread.resolved) continue;
              const range = resolveAnchor(state, thread.anchor);
              if (!range) continue;
              decorations.push(
                Decoration.inline(range.from, range.to, {
                  class: thread.id === storage.activeId ? "comment-mark comment-mark-active" : "comment-mark",
                  "data-comment-id": thread.id,
                }),
              );
            }
            return DecorationSet.create(state.doc, decorations);
          },
          handleClick(_view, _pos, event) {
            const target = (event.target as HTMLElement | null)?.closest("[data-comment-id]");
            const id = target?.getAttribute("data-comment-id");
            if (id && storage.onSelect) storage.onSelect(id);
            return false;
          },
        },
      }),
    ];
  },
});

/** Push new thread data into the extension and redraw the highlights. */
export function updateCommentHighlights(
  editor: Editor,
  threads: HighlightThread[],
  activeId: string | null,
  onSelect: (id: string) => void,
) {
  editor.storage.commentHighlights.onSelect = onSelect;
  editor.storage.commentHighlights.threads = threads;
  editor.storage.commentHighlights.activeId = activeId;
  if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(key, { refresh: true }));
}
