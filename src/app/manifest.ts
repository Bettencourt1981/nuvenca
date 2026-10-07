import type { MetadataRoute } from "next";

/** Installable app (home screen / desktop), opening on My files. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nuvenca",
    short_name: "Nuvenca",
    description: "Ficheiros, documentos e folhas de cálculo na nuvem · Files, documents and spreadsheets in the cloud",
    lang: "pt",
    start_url: "/drive",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#2563eb",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
