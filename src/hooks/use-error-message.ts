"use client";

import { useTranslations } from "next-intl";

/** Translate an error code from a Server Action into a user-facing message. */
export function useErrorMessage() {
  const t = useTranslations("errors");
  return (code: string | null | undefined) => {
    const key = (code ?? "generic") as "generic";
    return t.has(key) ? t(key) : t("generic");
  };
}
