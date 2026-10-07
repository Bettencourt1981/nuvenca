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

export type CollabUser = { id: string; name: string };

/** Opens the live session for a native file: Yjs doc + Supabase provider. */
export function useCollaboration({ fileId, canEdit, user }: { fileId: string; canEdit: boolean; user: CollabUser }) {
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

  return { ...session, status, saveStatus, synced, peers, error };
}
