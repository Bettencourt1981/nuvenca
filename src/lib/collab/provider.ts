"use client";

import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { fromBase64, toBase64 } from "./base64";

/**
 * Yjs provider built on Supabase only:
 * - live edits and cursors travel over a private Realtime channel `file:<id>`
 *   (the database policies decide who may listen and who may broadcast);
 * - edits are persisted with the `append_document_update` RPC, straight from
 *   the browser, and loaded with `load_document`.
 *
 * Yjs merges are commutative and idempotent, so applying the same update twice
 * or in a different order is harmless; that keeps the protocol simple.
 */

export type ConnectionStatus = "connecting" | "connected" | "offline";
export type SaveStatus = "saved" | "saving" | "unsaved" | "error";

export type Collaborator = { key: string; userId: string; name: string; color: string; canEdit: boolean };

type ProviderEvents = {
  status: ConnectionStatus;
  save: SaveStatus;
  synced: boolean;
  peers: Collaborator[];
  error: string;
};

type Listener<T> = (value: T) => void;

type LoadResult = {
  access_level: number;
  revision: number;
  state: string;
  updates: { id: number; payload: string }[];
};

const BROADCAST_INTERVAL = 60; // ms: batch keystrokes into one message
const SAVE_DELAY = 800; // ms of quiet before saving
const SAVE_MAX_WAIT = 4000; // ms: save at least this often while typing
const MAX_BROADCAST_BYTES = 200_000;
const COMPACT_AFTER_UPDATES = 50;

export class SupabaseYjsProvider {
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  readonly fileId: string;
  readonly canEdit: boolean;

  private supabase: SupabaseClient;
  private channel: RealtimeChannel | null = null;
  private listeners = new Map<keyof ProviderEvents, Set<Listener<never>>>();
  private outgoing: Uint8Array[] = [];
  private unsaved: Uint8Array[] = [];
  private broadcastTimer: ReturnType<typeof setTimeout> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private firstUnsavedAt = 0;
  private saving = false;
  private connected = false;
  private destroyed = false;
  private destroyTimer: ReturnType<typeof setTimeout> | null = null;
  private onCompactNeeded?: () => void;
  private user: { id: string; name: string; color: string };

  status: ConnectionStatus = "connecting";
  saveStatus: SaveStatus = "saved";
  synced = false;
  peers: Collaborator[] = [];

  constructor(options: {
    supabase: SupabaseClient;
    fileId: string;
    doc: Y.Doc;
    canEdit: boolean;
    user: { id: string; name: string; color: string };
    onCompactNeeded?: () => void;
  }) {
    this.supabase = options.supabase;
    this.fileId = options.fileId;
    this.doc = options.doc;
    this.canEdit = options.canEdit;
    this.user = options.user;
    this.onCompactNeeded = options.onCompactNeeded;
    this.awareness = new Awareness(this.doc);
    this.awareness.setLocalStateField("user", { name: options.user.name, color: options.user.color });

  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Start syncing. `disconnect()` undoes it, so React effects can call these
   * in pairs (including Strict Mode's mount → unmount → mount in development).
   */
  async connect() {
    if (this.destroyTimer) clearTimeout(this.destroyTimer);
    this.destroyTimer = null;
    if (this.connected || this.destroyed) return;
    this.connected = true;
    this.doc.on("update", this.handleDocUpdate);
    this.awareness.on("update", this.handleAwarenessUpdate);
    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);
    window.addEventListener("beforeunload", this.handleBeforeUnload);
    await this.supabase.realtime.setAuth();
    if (!this.connected) return;
    const channel = this.supabase.channel(`file:${this.fileId}`, {
      config: { private: true, broadcast: { self: false }, presence: { key: String(this.doc.clientID) } },
    });
    this.channel = channel;

    channel
      .on("broadcast", { event: "update" }, ({ payload }) => this.applyRemote(payload?.data))
      .on("broadcast", { event: "sync-request" }, ({ payload }) => this.answerSyncRequest(payload))
      .on("broadcast", { event: "sync-reply" }, ({ payload }) => this.handleSyncReply(payload))
      .on("broadcast", { event: "reload" }, () => void this.load())
      .on("broadcast", { event: "awareness" }, ({ payload }) => {
        if (payload?.data) applyAwarenessUpdate(this.awareness, fromBase64(payload.data), this);
      })
      .on("broadcast", { event: "awareness-request" }, () => this.broadcastAwareness(true))
      .on("presence", { event: "sync" }, () => this.updatePeers());

    channel.subscribe(async (status) => {
      if (!this.connected || this.channel !== channel) return;
      if (status === "SUBSCRIBED") {
        this.setStatus("connected");
        await channel.track({
          userId: this.user.id,
          name: this.user.name,
          color: this.user.color,
          canEdit: this.canEdit,
        });
        if (this.canEdit) {
          this.send("sync-request", { from: this.doc.clientID, sv: toBase64(Y.encodeStateVector(this.doc)) });
          this.send("awareness-request", {});
          this.broadcastAwareness(true);
        }
        void this.flushSave();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        this.setStatus("offline");
      }
    });

    await this.load();
  }

  /** Load the stored state (and any edits not yet merged into it). */
  async load() {
    const { data, error } = await this.supabase.rpc("load_document", { p_file_id: this.fileId });
    if (error || !data) {
      this.emit("error", error?.message ?? "not_found");
      return;
    }
    const result = data as unknown as LoadResult;
    Y.transact(
      this.doc,
      () => {
        if (result.state) Y.applyUpdate(this.doc, fromBase64(result.state), "load");
        for (const update of result.updates) Y.applyUpdate(this.doc, fromBase64(update.payload), "load");
      },
      "load",
    );
    if (!this.synced) {
      this.synced = true;
      this.emit("synced", true);
    }
    if (this.canEdit && result.updates.length > COMPACT_AFTER_UPDATES) this.onCompactNeeded?.();
  }

  /** Stop syncing (pending edits are still saved). Destroys itself shortly after unless reconnected. */
  disconnect() {
    if (!this.connected) return;
    this.connected = false;
    if (this.broadcastTimer) {
      clearTimeout(this.broadcastTimer);
      this.flushBroadcast();
    }
    void this.flushSave();
    removeAwarenessStates(this.awareness, [this.doc.clientID], "local");
    this.doc.off("update", this.handleDocUpdate);
    this.awareness.off("update", this.handleAwarenessUpdate);
    window.removeEventListener("online", this.handleOnline);
    window.removeEventListener("offline", this.handleOffline);
    window.removeEventListener("beforeunload", this.handleBeforeUnload);
    if (this.channel) void this.supabase.removeChannel(this.channel);
    this.channel = null;
    this.setStatus("connecting");
    this.destroyTimer = setTimeout(() => this.destroy(), 1000);
  }

  private destroy() {
    if (this.destroyed || this.connected) return;
    this.destroyed = true;
    this.awareness.destroy();
    if (this.saveTimer) clearTimeout(this.saveTimer);
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  on<K extends keyof ProviderEvents>(event: K, listener: Listener<ProviderEvents[K]>) {
    let set = this.listeners.get(event) as Set<Listener<ProviderEvents[K]>> | undefined;
    if (!set) {
      set = new Set();
      this.listeners.set(event, set as Set<Listener<never>>);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  private emit<K extends keyof ProviderEvents>(event: K, value: ProviderEvents[K]) {
    const set = this.listeners.get(event) as Set<Listener<ProviderEvents[K]>> | undefined;
    set?.forEach((listener) => listener(value));
  }

  private setStatus(status: ConnectionStatus) {
    if (this.status === status) return;
    this.status = status;
    this.emit("status", status);
  }

  private setSaveStatus(status: SaveStatus) {
    if (this.saveStatus === status) return;
    this.saveStatus = status;
    this.emit("save", status);
  }

  // ---------------------------------------------------------------------------
  // Document updates
  // ---------------------------------------------------------------------------

  private handleDocUpdate = (update: Uint8Array, origin: unknown) => {
    // Remote and loaded updates are already shared/stored.
    if (origin === this || origin === "load" || !this.canEdit) return;
    this.outgoing.push(update);
    this.unsaved.push(update);
    this.setSaveStatus("unsaved");
    if (!this.broadcastTimer) this.broadcastTimer = setTimeout(this.flushBroadcast, BROADCAST_INTERVAL);
    this.scheduleSave();
  };

  private flushBroadcast = () => {
    this.broadcastTimer = null;
    if (this.outgoing.length === 0) return;
    const merged = Y.mergeUpdates(this.outgoing);
    this.outgoing = [];
    if (merged.byteLength > MAX_BROADCAST_BYTES) {
      // Too big for one message: save first, then tell peers to reload.
      void this.flushSave().then(() => this.send("reload", {}));
      return;
    }
    this.send("update", { data: toBase64(merged) });
  };

  private applyRemote(data: unknown) {
    if (typeof data !== "string" || !data) return;
    try {
      Y.applyUpdate(this.doc, fromBase64(data), this);
    } catch (error) {
      console.error("Ignoring malformed update", error);
    }
  }

  /**
   * Two-way sync when an editor (re)joins: each side sends what the other is
   * missing according to its state vector. Content found this way may never
   * have reached the database (e.g. a peer closed before saving), so it is
   * saved again; duplicates are harmless.
   */
  private answerSyncRequest(payload: { from?: number; sv?: string } | undefined) {
    if (!this.canEdit || typeof payload?.from !== "number" || typeof payload.sv !== "string") return;
    const diff = Y.encodeStateAsUpdate(this.doc, fromBase64(payload.sv));
    this.send("sync-reply", {
      to: payload.from,
      from: this.doc.clientID,
      sv: toBase64(Y.encodeStateVector(this.doc)),
      data: diff.byteLength > 2 && diff.byteLength <= MAX_BROADCAST_BYTES ? toBase64(diff) : "",
    });
    if (diff.byteLength > 2) {
      this.unsaved.push(diff);
      this.scheduleSave();
    }
  }

  private handleSyncReply(payload: { to?: number; from?: number; sv?: string; data?: string } | undefined) {
    if (payload?.to !== this.doc.clientID) return;
    this.applyRemote(payload.data);
    if (!this.canEdit || typeof payload.from !== "number" || typeof payload.sv !== "string") return;
    const diff = Y.encodeStateAsUpdate(this.doc, fromBase64(payload.sv));
    if (diff.byteLength > 2 && diff.byteLength <= MAX_BROADCAST_BYTES) {
      // No `sv` here, so the exchange stops after this message.
      this.send("sync-reply", { to: payload.from, data: toBase64(diff) });
    }
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  private scheduleSave() {
    const now = Date.now();
    if (!this.firstUnsavedAt) this.firstUnsavedAt = now;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    const wait = now - this.firstUnsavedAt >= SAVE_MAX_WAIT ? 0 : SAVE_DELAY;
    this.saveTimer = setTimeout(() => void this.flushSave(), wait);
  }

  /** Save pending edits. Safe to call at any time. */
  async flushSave(): Promise<void> {
    if (this.saving || this.unsaved.length === 0 || !this.canEdit) return;
    this.saving = true;
    this.firstUnsavedAt = 0;
    const batch = this.unsaved;
    this.unsaved = [];
    this.setSaveStatus("saving");
    const { error } = await this.supabase.rpc("append_document_update", {
      p_file_id: this.fileId,
      p_payload: toBase64(Y.mergeUpdates(batch)),
    });
    this.saving = false;
    if (error) {
      // Keep the edits and retry; Yjs makes duplicates harmless.
      this.unsaved = [...batch, ...this.unsaved];
      this.setSaveStatus("error");
      if (!this.destroyed) this.saveTimer = setTimeout(() => void this.flushSave(), 3000);
      return;
    }
    if (this.unsaved.length > 0) {
      this.scheduleSave();
      this.setSaveStatus("unsaved");
    } else {
      this.setSaveStatus("saved");
    }
  }

  get hasUnsavedChanges() {
    return this.unsaved.length > 0 || this.saving;
  }

  // ---------------------------------------------------------------------------
  // Awareness (cursors, selections) and presence (who is here)
  // ---------------------------------------------------------------------------

  private awarenessTimer: ReturnType<typeof setTimeout> | null = null;

  private handleAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin !== "local" || !this.canEdit) return;
    const changed = [...added, ...updated, ...removed];
    if (!changed.includes(this.doc.clientID)) return;
    if (this.awarenessTimer) return;
    this.awarenessTimer = setTimeout(() => {
      this.awarenessTimer = null;
      this.broadcastAwareness(false);
    }, 40);
  };

  private broadcastAwareness(full: boolean) {
    if (!this.canEdit || this.destroyed) return;
    const clients = full ? Array.from(this.awareness.getStates().keys()) : [this.doc.clientID];
    this.send("awareness", { data: toBase64(encodeAwarenessUpdate(this.awareness, clients)) });
  }

  private updatePeers() {
    if (!this.channel) return;
    const state = this.channel.presenceState<{ userId: string; name: string; color: string; canEdit: boolean }>();
    const peers: Collaborator[] = [];
    for (const [key, metas] of Object.entries(state)) {
      const meta = metas[0];
      if (meta && key !== String(this.doc.clientID)) {
        peers.push({ key, userId: meta.userId, name: meta.name, color: meta.color, canEdit: meta.canEdit });
      }
    }
    this.peers = peers;
    this.emit("peers", peers);
  }

  // ---------------------------------------------------------------------------
  // Transport helpers
  // ---------------------------------------------------------------------------

  private send(event: string, payload: Record<string, unknown>) {
    if (!this.channel || this.status !== "connected") return;
    void this.channel.send({ type: "broadcast", event, payload });
  }

  private handleOnline = () => {
    this.setStatus("connecting");
    void this.flushSave();
  };

  private handleOffline = () => this.setStatus("offline");

  private handleBeforeUnload = (event: BeforeUnloadEvent) => {
    if (this.hasUnsavedChanges) {
      void this.flushSave();
      event.preventDefault();
    }
  };
}
