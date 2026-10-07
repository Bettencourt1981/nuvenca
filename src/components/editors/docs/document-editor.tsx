"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import * as Y from "yjs";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { yDocToProsemirrorJSON } from "@tiptap/y-tiptap";
import {
  Download,
  FilePlus2,
  History,
  ImagePlus,
  Link2,
  MessageSquarePlus,
  Minus,
  Printer,
  Redo2,
  Subscript,
  Superscript,
  Table as TableIcon,
  Trash2,
  Undo2,
} from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { colorFor } from "@/lib/collab/colors";
import { toBase64 } from "@/lib/collab/base64";
import { createClient } from "@/lib/supabase/client";
import { createNativeFile } from "@/lib/actions/documents";
import { trashItems } from "@/lib/actions/drive";
import { documentExtensions, DOCUMENT_FIELD } from "@/lib/editors/docs/extensions";
import { uploadDocumentImage } from "@/lib/editors/docs/assets";
import { docxToHtml } from "@/lib/editors/docs/import-docx";
import { useErrorMessage } from "@/hooks/use-error-message";
import { ACCESS } from "@/lib/types";
import { DropdownContent, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { NameDialog } from "@/components/drive/name-dialog";
import { Spinner } from "@/components/ui/spinner";
import { EditorHeader, MenuBarButton, type EditorFile } from "../editor-header";
import { useCollaboration, type CollabUser } from "../use-collaboration";
import { CommentsPanel, useComments } from "../comments";
import { VersionHistoryPanel } from "../version-history";
import { DocsToolbar } from "./toolbar";
import { TableBar } from "./table-bar";
import { DocumentViewer } from "./document-viewer";
import {
  CommentHighlights,
  resolveAnchor,
  selectionAnchor,
  updateCommentHighlights,
  type TextAnchor,
} from "./comment-highlights";
import "./document.css";

const AUTO_VERSION_EVERY = 10 * 60 * 1000;

type Panel = "comments" | "history" | null;

export function DocumentEditor({
  file,
  user,
  backHref,
  location,
}: {
  file: EditorFile;
  user: CollabUser;
  backHref: string;
  /** Where "New document" creates its file. */
  location: { workspaceId: string; parentId: string | null };
}) {
  const t = useTranslations("editor");
  const message = useErrorMessage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const canEdit = file.accessLevel >= ACCESS.editor;
  const canComment = file.accessLevel >= ACCESS.commenter;
  const { doc, provider, status, saveStatus, synced, peers, error } = useCollaboration({ fileId: file.id, canEdit, user });

  const [panel, setPanel] = useState<Panel>(null);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ anchor: TextAnchor; quote: string | null } | null>(null);
  const [preview, setPreview] = useState<{ id: string; state: Uint8Array } | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const comments = useComments<TextAnchor>(file.id, canComment);

  const editor = useEditor(
    {
      immediatelyRender: false,
      editable: canEdit,
      extensions: [
        ...documentExtensions(),
        Collaboration.configure({ document: doc, field: DOCUMENT_FIELD }),
        ...(canEdit ? [CollaborationCaret.configure({ provider, user: { name: user.name, color: colorFor(user.id) } })] : []),
        Placeholder.configure({ placeholder: canEdit ? t("docs.placeholder") : "" }),
        CharacterCount,
        CommentHighlights,
      ],
      editorProps: { attributes: { class: "doc-content", spellcheck: "true" } },
    },
    [doc, provider, canEdit],
  );

  // Keep comment highlights in sync with the threads.
  useEffect(() => {
    if (!editor) return;
    updateCommentHighlights(
      editor,
      comments.threads.map((thread) => ({ id: thread.id, anchor: thread.anchor, resolved: thread.resolved })),
      activeThread,
      (id) => {
        setActiveThread(id);
        setPanel("comments");
      },
    );
  }, [editor, comments.threads, activeThread]);

  // Automatic version snapshots while editing.
  const lastVersionAt = useRef(0);
  const createVersion = useCallback(
    async (label: string | null) => {
      const supabase = createClient();
      const { error: versionError } = await supabase.rpc("create_document_version", {
        p_file_id: file.id,
        p_state: toBase64(Y.encodeStateAsUpdate(doc)),
        p_label: label ?? "",
      });
      if (versionError) throw new Error(versionError.message);
      lastVersionAt.current = Date.now();
    },
    [doc, file.id],
  );
  useEffect(() => {
    if (!canEdit) return;
    return provider.on("save", (state) => {
      if (state === "saved" && Date.now() - lastVersionAt.current > AUTO_VERSION_EVERY) {
        void createVersion(null).catch(() => undefined);
      }
    });
  }, [provider, canEdit, createVersion]);

  // Import a Word document into this (new, empty) document: ?import=<fileId>
  // While the URL has ?import=…, the page shows an "Importing…" overlay.
  const importId = canEdit ? searchParams.get("import") : null;
  const importing = useRef(false);
  useEffect(() => {
    if (!editor || !synced || !importId || importing.current) return;
    importing.current = true;
    if (!editor.isEmpty) {
      router.replace(`/document/${file.id}`);
      return;
    }
    (async () => {
      try {
        const response = await fetch(`/api/files/${importId}/download`);
        if (!response.ok) throw new Error("import_failed");
        const html = await docxToHtml(await response.arrayBuffer(), (image) => uploadDocumentImage(file.id, image));
        editor.commands.setContent(html);
        await provider.flushSave();
        await createVersion(t("history.imported"));
      } catch {
        toast.error(t("importFailed"));
      } finally {
        router.replace(`/document/${file.id}`);
      }
    })();
  }, [editor, synced, importId, file.id, provider, router, createVersion, t]);

  const insertImage = useCallback(
    async (image: File) => {
      if (!editor) return;
      const toastId = toast.loading(t("docs.uploadingImage"));
      try {
        const src = await uploadDocumentImage(file.id, image);
        editor.chain().focus().setImage({ src, alt: image.name }).run();
        toast.dismiss(toastId);
      } catch (uploadError) {
        toast.error(message((uploadError as Error).message), { id: toastId });
      }
    },
    [editor, file.id, message, t],
  );

  const startComment = useCallback(() => {
    if (!editor) return;
    const anchor = selectionAnchor(editor);
    if (!anchor) return void toast(t("docs.selectToComment"));
    setDraft(anchor);
    setPanel("comments");
  }, [editor, t]);

  const activateThread = useCallback(
    (id: string) => {
      setActiveThread(id);
      const thread = comments.threads.find((x) => x.id === id);
      if (!editor || !thread) return;
      const range = resolveAnchor(editor.state, thread.anchor);
      if (range) {
        editor.commands.setTextSelection(range.from);
        editor.commands.scrollIntoView();
      }
    },
    [comments.threads, editor],
  );

  const download = useCallback(async () => {
    await provider.flushSave();
    const link = document.createElement("a");
    link.href = `/api/files/${file.id}/download`;
    link.click();
  }, [provider, file.id]);

  const newDocument = useCallback(async () => {
    const result = await createNativeFile({ ...location, name: t("docs.untitled"), type: "document" });
    if (!result.ok) return void toast.error(message(result.error));
    window.open(`/document/${result.data.id}`, "_blank");
  }, [location, message, t]);

  // Keyboard shortcut for comments, like other editors (Ctrl/Cmd+Alt+M).
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === "m") {
        event.preventDefault();
        if (canComment) startComment();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canComment, startComment]);

  const openThreads = comments.threads.filter((thread) => !thread.resolved).length;

  const menu = editor ? (
    <DocumentMenus
      editor={editor}
      canEdit={canEdit}
      canComment={canComment}
      onNew={newDocument}
      onDownload={download}
      onHistory={() => setPanel("history")}
      onLink={() => setLinkOpen(true)}
      onComment={startComment}
      onImage={insertImage}
      onTrash={async () => {
        const result = await trashItems({ ids: [file.id] });
        if (!result.ok) return void toast.error(message(result.error));
        router.push(backHref);
      }}
    />
  ) : null;

  return (
    <div className="editor-shell flex h-dvh flex-col bg-background">
      <EditorHeader
        file={file}
        backHref={backHref}
        status={status}
        saveStatus={saveStatus}
        peers={peers}
        menu={menu}
        comments={
          canComment
            ? { open: panel === "comments", count: openThreads, onToggle: () => setPanel(panel === "comments" ? null : "comments") }
            : undefined
        }
      />
      {editor && !preview ? (
        <>
          <DocsToolbar
            editor={editor}
            canEdit={canEdit}
            canComment={canComment}
            onLink={() => setLinkOpen(true)}
            onImage={insertImage}
            onComment={startComment}
          />
          {canEdit ? <TableBar editor={editor} /> : null}
        </>
      ) : null}
      {preview ? (
        <div className="no-print flex items-center justify-between gap-3 border-b border-border bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {t("history.previewing")}
          <button type="button" className="font-medium underline" onClick={() => setPreview(null)}>
            {t("history.backToCurrent")}
          </button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <main className="doc-scroller min-w-0 flex-1 overflow-y-auto">
          {error ? (
            <p className="p-10 text-center text-muted">{message(error)}</p>
          ) : preview ? (
            <div className="doc-page">
              <DocumentViewer key={preview.id} state={preview.state} />
            </div>
          ) : (
            <div className="doc-page relative">
              {!synced || importId ? (
                <div className="absolute inset-0 z-10 flex items-start justify-center bg-white/70 pt-24 dark:bg-black/30">
                  <span className="flex items-center gap-2 text-sm text-muted">
                    <Spinner />
                    {importId ? t("importing") : t("loading")}
                  </span>
                </div>
              ) : null}
              <EditorContent editor={editor} />
            </div>
          )}
          {editor ? <WordCount editor={editor} /> : null}
        </main>
        {panel === "comments" ? (
          <CommentsPanel
            api={comments}
            currentUserId={user.id}
            canComment={canComment}
            canModerate={canEdit}
            activeId={activeThread}
            onActivate={activateThread}
            draft={draft}
            onDraftDone={(id) => {
              setDraft(null);
              if (id) setActiveThread(id);
            }}
            onClose={() => setPanel(null)}
          />
        ) : null}
        {panel === "history" && canEdit ? (
          <VersionHistoryPanel
            fileId={file.id}
            selectedId={preview?.id ?? null}
            onSelect={setPreview}
            onSaveCurrent={(label) => createVersion(label || null)}
            onRestore={async () => {
              if (!preview || !editor) return;
              await createVersion(t("history.beforeRestore"));
              const versionDoc = new Y.Doc();
              Y.applyUpdate(versionDoc, preview.state);
              editor.commands.setContent(yDocToProsemirrorJSON(versionDoc, DOCUMENT_FIELD));
              versionDoc.destroy();
              setPreview(null);
              toast.success(t("history.restored"));
            }}
            onClose={() => {
              setPreview(null);
              setPanel(null);
            }}
          />
        ) : null}
      </div>

      {linkOpen && editor ? (
        <NameDialog
          open
          onOpenChange={setLinkOpen}
          title={t("docs.linkTitle")}
          label={t("docs.linkUrl")}
          initialValue={(editor.getAttributes("link").href as string | undefined) ?? "https://"}
          submitLabel={t("docs.applyLink")}
          onSubmit={async (value) => {
            const url = value.trim();
            if (!url || url === "https://") editor.chain().focus().extendMarkRange("link").unsetLink().run();
            else if (!/^(https?:|mailto:|tel:|\/)/i.test(url)) return t("docs.invalidLink");
            else if (editor.state.selection.empty && !editor.isActive("link"))
              editor.chain().focus().insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href: url } }] }).run();
            else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
            return null;
          }}
        />
      ) : null}
    </div>
  );
}

function WordCount({ editor }: { editor: Editor }) {
  const t = useTranslations("editor.docs");
  const words = useEditorState({ editor, selector: ({ editor: e }) => e.storage.characterCount.words() });
  return <p className="no-print pb-6 text-center text-xs text-muted">{t("words", { count: words })}</p>;
}

function DocumentMenus({
  editor,
  canEdit,
  canComment,
  onNew,
  onDownload,
  onHistory,
  onLink,
  onComment,
  onImage,
  onTrash,
}: {
  editor: Editor;
  canEdit: boolean;
  canComment: boolean;
  onNew: () => void;
  onDownload: () => void;
  onHistory: () => void;
  onLink: () => void;
  onComment: () => void;
  onImage: (file: File) => void;
  onTrash: () => void;
}) {
  const t = useTranslations("editor");
  const imageInput = useRef<HTMLInputElement>(null);
  const chain = () => editor.chain().focus();

  const menus = useMemo(() => ["file", "edit", "insert", "format"] as const, []);
  return (
    <>
      {menus.map((menu) => {
        if ((menu === "insert" || menu === "format" || menu === "edit") && !canEdit) return null;
        return (
          <DropdownMenu key={menu}>
            <DropdownTrigger asChild>
              <MenuBarButton>{t(`menus.${menu}`)}</MenuBarButton>
            </DropdownTrigger>
            <DropdownContent align="start" className="min-w-60" onCloseAutoFocus={(event) => event.preventDefault()}>
              {menu === "file" ? (
                <>
                  {canEdit ? (
                    <DropdownItem icon={<FilePlus2 />} onSelect={onNew}>
                      {t("docs.newDocument")}
                    </DropdownItem>
                  ) : null}
                  <DropdownItem icon={<Download />} onSelect={onDownload}>
                    {t("docs.downloadDocx")}
                  </DropdownItem>
                  <DropdownItem icon={<Printer />} onSelect={() => window.print()}>
                    {t("docs.printPdf")}
                  </DropdownItem>
                  {canEdit ? (
                    <>
                      <DropdownSeparator />
                      <DropdownItem icon={<History />} onSelect={onHistory}>
                        {t("history.title")}
                      </DropdownItem>
                      <DropdownSeparator />
                      <DropdownItem icon={<Trash2 />} onSelect={onTrash} danger>
                        {t("moveToTrash")}
                      </DropdownItem>
                    </>
                  ) : null}
                </>
              ) : null}
              {menu === "edit" ? (
                <>
                  <DropdownItem icon={<Undo2 />} onSelect={() => chain().undo().run()}>
                    {t("docs.undo")}
                  </DropdownItem>
                  <DropdownItem icon={<Redo2 />} onSelect={() => chain().redo().run()}>
                    {t("docs.redo")}
                  </DropdownItem>
                  <DropdownSeparator />
                  <DropdownItem onSelect={() => chain().selectAll().run()}>{t("docs.selectAll")}</DropdownItem>
                </>
              ) : null}
              {menu === "insert" ? (
                <>
                  <DropdownItem icon={<ImagePlus />} onSelect={() => imageInput.current?.click()}>
                    {t("docs.image")}
                  </DropdownItem>
                  <DropdownItem icon={<TableIcon />} onSelect={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: false }).run()}>
                    {t("docs.insertTable")}
                  </DropdownItem>
                  <DropdownItem icon={<Link2 />} onSelect={onLink}>
                    {t("docs.link")}
                  </DropdownItem>
                  <DropdownItem icon={<Minus />} onSelect={() => chain().setHorizontalRule().run()}>
                    {t("docs.horizontalLine")}
                  </DropdownItem>
                  {canComment ? (
                    <DropdownItem icon={<MessageSquarePlus />} onSelect={onComment}>
                      {t("docs.addComment")}
                    </DropdownItem>
                  ) : null}
                </>
              ) : null}
              {menu === "format" ? (
                <>
                  <DropdownItem onSelect={() => chain().toggleBold().run()}>{t("docs.bold")}</DropdownItem>
                  <DropdownItem onSelect={() => chain().toggleItalic().run()}>{t("docs.italic")}</DropdownItem>
                  <DropdownItem onSelect={() => chain().toggleUnderline().run()}>{t("docs.underline")}</DropdownItem>
                  <DropdownItem onSelect={() => chain().toggleStrike().run()}>{t("docs.strike")}</DropdownItem>
                  <DropdownItem icon={<Superscript />} onSelect={() => chain().toggleSuperscript().run()}>
                    {t("docs.superscript")}
                  </DropdownItem>
                  <DropdownItem icon={<Subscript />} onSelect={() => chain().toggleSubscript().run()}>
                    {t("docs.subscript")}
                  </DropdownItem>
                  <DropdownSeparator />
                  <DropdownItem onSelect={() => chain().toggleBlockquote().run()}>{t("docs.quote")}</DropdownItem>
                  <DropdownItem onSelect={() => chain().toggleCodeBlock().run()}>{t("docs.codeBlock")}</DropdownItem>
                  <DropdownSeparator />
                  <DropdownItem onSelect={() => chain().unsetAllMarks().clearNodes().run()}>{t("docs.clearFormatting")}</DropdownItem>
                </>
              ) : null}
            </DropdownContent>
          </DropdownMenu>
        );
      })}
      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        hidden
        onChange={(event) => {
          const image = event.target.files?.[0];
          if (image) onImage(image);
          event.target.value = "";
        }}
      />
    </>
  );
}
