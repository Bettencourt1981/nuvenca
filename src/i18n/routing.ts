import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["pt", "en"],
  defaultLocale: "pt",
  // URLs stay clean (/drive, not /pt/drive); the locale lives in a cookie and
  // is detected from the browser on the first visit.
  localePrefix: "never",
});

export type Locale = (typeof routing.locales)[number];
