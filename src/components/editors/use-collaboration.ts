"use client";

import { useEffect, useState } from "react";
import * as Y from "yjs";
import { createClient } from "@/lib/supabase/client";
import { colorFor } from "@/lib/collab/colors";
import {
  SupabaseYjsProvider,
  type Collaborator,
  type ConnectionStatus,
  type SaveStatus,
} from "@/lib/collab/provider";
import { compactDocument } from "@/lib/actions/documents";
import type { NativeType } from "@/lib/editors/native";
import { nativeText } from "@/lib/editors/text";

export type CollabUser = { id: string; name: string };

/** How long after someone's edit the search index is refreshed. */
const INDEX_DELAY = 4000;

/** Opens the live session for a native file: Yjs doc + Supabase provider. */
export function useCollaboration({
  fileId,
  type,
  canEdit,
  user,
}: {
  fileId: string;
  type: NativeType;
  canEdit: boolean;
  user: CollabUser;
}) {
  const [session] = useState(() => {
    const doc = new Y.Doc();
    const provider = new SupabaseYjsProvider({
      supabase: createClient(),
      fileId,
      doc,
      canEdit,
      user: { id: user.id, name: user.name, color: colorFor(user.id) },
      onCompactNeeded: () => void compactDocument({ fileId }),
    });
    return { doc, provider };
  });
  const { provider } = session;

  const [status, setStatus] = useState<ConnectionStatus>(provider.status);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(provider.saveStatus);
  const [synced, setSynced] = useState(provider.synced);
  const [peers, setPeers] = useState<Collaborator[]>(provider.peers);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = [
      provider.on("status", setStatus),
      provider.on("save", setSaveStatus),
      provider.on("synced", setSynced),
      provider.on("peers", setPeers),
      provider.on("error", setError),
    ];
    void provider.connect();
    return () => {
      unsubscribe.forEach((fn) => fn());
      provider.disconnect();
    };
  }, [provider]);

  // Keep the search index in step with the content. Each editor indexes its
  // own edits (not everyone else's), a few seconds after they happen.
  const { doc } = session;
  useEffect(() => {
    if (!canEdit || !synced) return;
    const supabase = createClient();
    let indexed: string | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const index = () => {
      timer = null;
      const text = nativeText(doc, type);
      if (text === indexed) return;
      indexed = text;
      // PostgREST requests only run once awaited/then-ed.
      void supabase.rpc("set_file_content", { p_file_id: fileId, p_content: text }).then(({ error }) => {
        if (error) indexed = null; // try again after the next edit
      });
    };
    const onUpdate = (_update: Uint8Array, origin: unknown) => {
      if (origin === "load" || origin === provider || timer) return;
      timer = setTimeout(index, INDEX_DELAY);
    };
    const flush = () => {
      if (!timer) return;
      clearTimeout(timer);
      index();
    };
    index();
    doc.on("update", onUpdate);
    window.addEventListener("pagehide", flush);
    return () => {
      doc.off("update", onUpdate);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [doc, provider, fileId, type, canEdit, synced]);

  return { ...session, status, saveStatus, synced, peers, error };
}
