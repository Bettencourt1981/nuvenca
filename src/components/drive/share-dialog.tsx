"use client";

import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Globe2, Link2, Lock, Trash2 } from "lucide-react";
import {
  getShareSettings,
  removeShare,
  setLinkSharing,
  shareWithEmail,
  updateShareRole,
  type ShareSettings,
} from "@/lib/actions/share";
import { useErrorMessage } from "@/hooks/use-error-message";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { initials } from "@/lib/utils";
import type { ShareRole } from "@/lib/types";

const ROLES: ShareRole[] = ["viewer", "commenter", "editor"];

export function ShareDialog({
  open,
  onOpenChange,
  fileId,
  name,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileId: string;
  name: string;
}) {
  const t = useTranslations("share");
  const common = useTranslations("common");
  const locale = useLocale();
  const message = useErrorMessage();
  // Callers mount this dialog only while it is open, so state starts fresh.
  const [loaded, setLoaded] = useState<Awaited<ReturnType<typeof getShareSettings>> | null>(null);
  const [version, setVersion] = useState(0);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("viewer");
  const [notify, setNotify] = useState(true);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getShareSettings({ fileId }).then((result) => {
      if (!cancelled) setLoaded(result);
    });
    return () => {
      cancelled = true;
    };
  }, [fileId, version]);

  const settings: ShareSettings | null = loaded?.ok ? loaded.data : null;
  const loadError = loaded && !loaded.ok ? message(loaded.error) : null;

  const run = (action: () => Promise<{ ok: boolean; error?: string }>, success?: string) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(message(result.error));
        return;
      }
      if (success) toast.success(success);
      setVersion((value) => value + 1);
    });

  const canManage = settings?.canManage ?? false;
  const link = settings?.link;
  const linkEnabled = Boolean(link?.enabled);

  const copyLink = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success(t("linkCopied"));
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t("title", { name })} className="max-w-lg">
      {!settings && !loadError ? (
        <div className="flex h-40 items-center justify-center text-muted">
          <Spinner className="size-6" />
        </div>
      ) : null}
      {loadError ? <p className="text-sm text-danger">{loadError}</p> : null}

      {settings ? (
        <div className="space-y-6">
          {canManage ? (
            <form
              className="flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const value = email.trim();
                if (!value) return;
                run(async () => {
                  const result = await shareWithEmail({
                    fileId,
                    email: value,
                    role,
                    notify: settings.canNotify && notify,
                    message: notify ? note : undefined,
                    locale,
                  });
                  if (!result.ok) return result;
                  setEmail("");
                  setNote("");
                  if (result.data.limited) toast.warning(t("notifyLimited"));
                  else toast.success(result.data.notified ? t("sharedNotified", { email: value }) : t("shared", { email: value }));
                  return result;
                });
              }}
            >
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  type="email"
                  placeholder={t("addPeople")}
                  aria-label={t("addPeople")}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="flex-1"
                />
                <div className="flex gap-2">
                  <Select
                    value={role}
                    onChange={(event) => setRole(event.target.value as ShareRole)}
                    className="w-auto"
                    aria-label={t("generalAccess")}
                  >
                    {ROLES.map((value) => (
                      <option key={value} value={value}>
                        {t(`roles.${value}`)}
                      </option>
                    ))}
                  </Select>
                  <Button type="submit" disabled={pending || !email.trim()}>
                    {t("add")}
                  </Button>
                </div>
              </div>
              {settings.canNotify && email.trim() ? (
                <>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={notify}
                      onChange={(event) => setNotify(event.target.checked)}
                      className="size-4 accent-primary"
                    />
                    {t("notify")}
                  </label>
                  {notify ? (
                    <textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder={t("messagePlaceholder")}
                      aria-label={t("messagePlaceholder")}
                      maxLength={1000}
                      rows={3}
                      className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    />
                  ) : null}
                </>
              ) : null}
            </form>
          ) : null}

          <section>
            <h3 className="mb-2 text-sm font-semibold">{t("peopleWithAccess")}</h3>
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {settings.owner?.name ? (
                <li className="flex items-center gap-3 rounded-lg px-1 py-1.5">
                  <Avatar label={settings.owner.name} />
                  <span className="min-w-0 flex-1 truncate text-sm">{settings.owner.name}</span>
                  <span className="text-sm text-muted">{t("owner")}</span>
                </li>
              ) : null}
              {settings.people.map((person) => (
                <li key={person.shareId} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
                  <Avatar label={person.fullName ?? person.email} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{person.fullName ?? person.email}</p>
                    <p className="truncate text-xs text-muted">
                      {person.fullName ? person.email : null}
                      {person.pending ? (
                        <span title={t("pendingHint")}>
                          {person.fullName ? " · " : null}
                          {t("pending")}
                        </span>
                      ) : null}
                      {person.inherited ? <span>{` · ${t("inherited")}`}</span> : null}
                    </p>
                  </div>
                  {canManage && !person.inherited ? (
                    <div className="flex items-center gap-1">
                      <Select
                        value={person.role}
                        onChange={(event) =>
                          run(
                            () => updateShareRole({ shareId: person.shareId, role: event.target.value as ShareRole }),
                            t("updated"),
                          )
                        }
                        className="h-8 w-auto text-xs"
                        aria-label={person.email}
                        disabled={pending}
                      >
                        {ROLES.map((value) => (
                          <option key={value} value={value}>
                            {t(`roles.${value}`)}
                          </option>
                        ))}
                      </Select>
                      <button
                        type="button"
                        onClick={() => run(() => removeShare({ shareId: person.shareId }), t("removed"))}
                        className="rounded-lg p-1.5 text-muted hover:bg-surface-hover hover:text-danger"
                        aria-label={t("removeAccess")}
                        disabled={pending}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-sm text-muted">{t(`roles.${person.role}`)}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {canManage ? (
            <section>
              <h3 className="mb-2 text-sm font-semibold">{t("generalAccess")}</h3>
              <div className="flex items-start gap-3 rounded-xl bg-surface-muted p-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface">
                  {linkEnabled ? (
                    <Globe2 className="size-4 text-success" aria-hidden />
                  ) : (
                    <Lock className="size-4 text-muted" aria-hidden />
                  )}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={linkEnabled ? "link" : "restricted"}
                      onChange={(event) =>
                        run(() =>
                          setLinkSharing({ fileId, enabled: event.target.value === "link", role: link?.role ?? "viewer" }),
                        )
                      }
                      className="h-8 w-auto text-sm font-medium"
                      aria-label={t("generalAccess")}
                      disabled={pending}
                    >
                      <option value="restricted">{t("restricted")}</option>
                      <option value="link">{t("anyoneWithLink")}</option>
                    </Select>
                    {linkEnabled ? (
                      <Select
                        value={link!.role}
                        onChange={(event) =>
                          run(() => setLinkSharing({ fileId, enabled: true, role: event.target.value as ShareRole }))
                        }
                        className="h-8 w-auto text-sm"
                        aria-label={t("anyoneWithLink")}
                        disabled={pending}
                      >
                        {ROLES.map((value) => (
                          <option key={value} value={value}>
                            {t(`roles.${value}`)}
                          </option>
                        ))}
                      </Select>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted">
                    {linkEnabled ? t("anyoneHint", { role: link!.role }) : t("restrictedHint")}
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          <div className="flex items-center justify-between gap-2">
            {linkEnabled && link ? (
              <Button variant="secondary" onClick={() => copyLink(link.url)}>
                {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
                {t("copyLink")}
              </Button>
            ) : (
              <span />
            )}
            <Button onClick={() => onOpenChange(false)}>{common("done")}</Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}

function Avatar({ label }: { label: string }) {
  return (
    <span
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary"
    >
      {initials(label)}
    </span>
  );
}
