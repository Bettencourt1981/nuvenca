"use client";

/**
 * Google Drive from the browser: pick files with the Google Picker, download or
 * export them, and save Nuvenca files back to Drive as Google Docs/Sheets.
 *
 * Uses only the `drive.file` scope: Nuvenca sees the files the person picks or
 * creates, nothing else (no restricted-scope security review needed). Tokens
 * stay in the page's memory; nothing is stored on our servers.
 */

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? "";
const APP_ID = process.env.NEXT_PUBLIC_GOOGLE_APP_ID ?? "";

export function googleDriveConfigured(): boolean {
  return Boolean(CLIENT_ID && API_KEY && APP_ID);
}

export const GOOGLE_MIME = {
  document: "application/vnd.google-apps.document",
  spreadsheet: "application/vnd.google-apps.spreadsheet",
  presentation: "application/vnd.google-apps.presentation",
  drawing: "application/vnd.google-apps.drawing",
  folder: "application/vnd.google-apps.folder",
} as const;

const OFFICE_MIME = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
} as const;

// ---------------------------------------------------------------------------
// Minimal typings for the Google scripts we use
// ---------------------------------------------------------------------------
type TokenResponse = { access_token?: string; expires_in?: number; error?: string };
type TokenClient = { requestAccessToken: (options?: { prompt?: string }) => void };
type PickerDoc = Record<string, unknown>;
type PickerData = Record<string, unknown>;
type PickerBuilder = {
  addView: (view: unknown) => PickerBuilder;
  setOAuthToken: (token: string) => PickerBuilder;
  setDeveloperKey: (key: string) => PickerBuilder;
  setAppId: (id: string) => PickerBuilder;
  setLocale: (locale: string) => PickerBuilder;
  setTitle: (title: string) => PickerBuilder;
  enableFeature: (feature: unknown) => PickerBuilder;
  setCallback: (callback: (data: PickerData) => void) => PickerBuilder;
  build: () => { setVisible: (visible: boolean) => void };
};
type GoogleNamespace = {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback?: (error: { type?: string }) => void;
      }) => TokenClient;
    };
  };
  picker: {
    PickerBuilder: new () => PickerBuilder;
    DocsView: new (viewId?: unknown) => { setIncludeFolders: (v: boolean) => unknown; setSelectFolderEnabled: (v: boolean) => unknown; setMode: (m: unknown) => unknown };
    ViewId: { DOCS: unknown };
    DocsViewMode: { LIST: unknown };
    Feature: { MULTISELECT_ENABLED: unknown; SUPPORT_DRIVES: unknown };
    Action: { PICKED: string; CANCEL: string };
    Response: { ACTION: string; DOCUMENTS: string };
    Document: { ID: string; NAME: string; MIME_TYPE: string; SIZE_BYTES?: string };
  };
};
declare global {
  interface Window {
    google?: GoogleNamespace;
    gapi?: { load: (name: string, callback: () => void) => void };
  }
}

const scripts = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
  let promise = scripts.get(src);
  if (!promise) {
    promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scripts.delete(src);
        reject(new Error("google_unavailable"));
      };
      document.head.appendChild(script);
    });
    scripts.set(src, promise);
  }
  return promise;
}

/**
 * Load Google's scripts ahead of time: the consent popup must open right after
 * the person's click, or browsers block it.
 */
export function preloadGoogle() {
  if (!googleDriveConfigured()) return;
  void loadScript("https://accounts.google.com/gsi/client").catch(() => undefined);
  void loadScript("https://apis.google.com/js/api.js").catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Access token (Google Identity Services)
// ---------------------------------------------------------------------------
let token: { value: string; expiresAt: number } | null = null;

/** Ask Google for access (a consent popup the first time). */
export async function getAccessToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  await loadScript("https://accounts.google.com/gsi/client");
  const google = window.google;
  if (!google?.accounts?.oauth2) throw new Error("google_unavailable");
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (response) => {
        if (!response.access_token) return reject(new Error("google_denied"));
        token = { value: response.access_token, expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000 };
        resolve(response.access_token);
      },
      error_callback: () => reject(new Error("google_denied")),
    });
    client.requestAccessToken({ prompt: token ? "" : undefined });
  });
}

// ---------------------------------------------------------------------------
// Picker
// ---------------------------------------------------------------------------
export type DriveFile = { id: string; name: string; mimeType: string };

/** Let the person choose files in their Google Drive. Resolves [] if cancelled. */
export async function pickDriveFiles(options: { accessToken: string; locale: string; title?: string }): Promise<DriveFile[]> {
  await loadScript("https://apis.google.com/js/api.js");
  await new Promise<void>((resolve) => window.gapi!.load("picker", resolve));
  const picker = window.google!.picker;
  return new Promise((resolve) => {
    const view = new picker.DocsView(picker.ViewId.DOCS);
    view.setIncludeFolders(true);
    view.setSelectFolderEnabled(false);
    view.setMode(picker.DocsViewMode.LIST);
    let builder = new picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(options.accessToken)
      .setDeveloperKey(API_KEY)
      .setAppId(APP_ID)
      .setLocale(options.locale === "pt" ? "pt-PT" : "en")
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .enableFeature(picker.Feature.SUPPORT_DRIVES);
    if (options.title) builder = builder.setTitle(options.title);
    builder
      .setCallback((data) => {
        const action = data[picker.Response.ACTION];
        if (action === picker.Action.CANCEL) resolve([]);
        if (action !== picker.Action.PICKED) return;
        const docs = (data[picker.Response.DOCUMENTS] as PickerDoc[] | undefined) ?? [];
        resolve(
          docs.map((doc) => ({
            id: String(doc[picker.Document.ID]),
            name: String(doc[picker.Document.NAME]),
            mimeType: String(doc[picker.Document.MIME_TYPE]),
          })),
        );
      })
      .build()
      .setVisible(true);
  });
}

// ---------------------------------------------------------------------------
// Download / export
// ---------------------------------------------------------------------------
export type DownloadedFile = {
  /** "document"/"spreadsheet": a Google Doc/Sheet, exported to Word/Excel for conversion. */
  kind: "document" | "spreadsheet" | "file";
  name: string;
  blob: Blob;
};

async function driveFetch(url: string, accessToken: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${accessToken}` } });
  if (response.ok) return response;
  if (response.status === 401) token = null;
  const reason = await response
    .json()
    .then((body: { error?: { errors?: { reason?: string }[] } }) => body.error?.errors?.[0]?.reason)
    .catch(() => undefined);
  throw new Error(reason === "exportSizeLimitExceeded" ? "google_too_large" : "google_failed");
}

const withExtension = (name: string, extension: string) =>
  name.toLowerCase().endsWith(`.${extension}`) ? name : `${name}.${extension}`;

/** Get a picked file's bytes. Google Docs/Sheets/Slides are exported to Office formats. */
export async function downloadDriveFile(file: DriveFile, accessToken: string): Promise<DownloadedFile> {
  const exportAs = async (mime: string) =>
    (await driveFetch(`${API}/files/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent(mime)}`, accessToken)).blob();
  switch (file.mimeType) {
    case GOOGLE_MIME.document:
      return { kind: "document", name: file.name, blob: await exportAs(OFFICE_MIME.docx) };
    case GOOGLE_MIME.spreadsheet:
      return { kind: "spreadsheet", name: file.name, blob: await exportAs(OFFICE_MIME.xlsx) };
    case GOOGLE_MIME.presentation:
      return { kind: "file", name: withExtension(file.name, "pptx"), blob: await exportAs(OFFICE_MIME.pptx) };
    case GOOGLE_MIME.drawing:
      return { kind: "file", name: withExtension(file.name, "pdf"), blob: await exportAs("application/pdf") };
    default:
      if (file.mimeType.startsWith("application/vnd.google-apps.")) throw new Error("google_unsupported");
      return {
        kind: "file",
        name: file.name,
        blob: await (await driveFetch(`${API}/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`, accessToken)).blob(),
      };
  }
}

// ---------------------------------------------------------------------------
// Save to Drive
// ---------------------------------------------------------------------------

/** Upload a Word/Excel file to the person's Drive, converted to a Google Doc/Sheet. */
export async function saveToDrive(options: {
  accessToken: string;
  name: string;
  data: Blob;
  as: "document" | "spreadsheet";
}): Promise<{ id: string; url: string }> {
  // Multipart upload: JSON metadata, then the file. Google converts it because
  // the metadata asks for a Google Docs/Sheets type.
  const metadata = { name: options.name, mimeType: GOOGLE_MIME[options.as] };
  const boundary = `nuvenca${crypto.randomUUID().replace(/-/g, "")}`;
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: ${options.as === "document" ? OFFICE_MIME.docx : OFFICE_MIME.xlsx}\r\n\r\n`,
    options.data,
    `\r\n--${boundary}--`,
  ]);
  const response = await driveFetch(`${UPLOAD_API}/files?uploadType=multipart&fields=id,webViewLink`, options.accessToken, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const created = (await response.json()) as { id: string; webViewLink?: string };
  const fallback = options.as === "document" ? "document" : "spreadsheets";
  return { id: created.id, url: created.webViewLink ?? `https://docs.google.com/${fallback}/d/${created.id}/edit` };
}
