"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { LogOut, Menu, Search, Settings } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Link, useRouter } from "@/i18n/navigation";
import { signOut } from "@/lib/actions/account";
import { Logo } from "@/components/logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { DropdownContent, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { initials } from "@/lib/utils";
import type { WorkspaceSummary } from "@/lib/types";
import { SidebarNav } from "./sidebar-nav";

export function TopBar({
  user,
  workspaces,
}: {
  user: { email: string; fullName: string | null };
  workspaces: WorkspaceSummary[];
}) {
  const t = useTranslations("nav");
  const auth = useTranslations("auth");
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border bg-surface px-2 sm:gap-4 sm:px-4">
      <DialogPrimitive.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogPrimitive.Trigger
          className="rounded-lg p-2 text-muted hover:bg-surface-hover lg:hidden"
          aria-label={t("openMenu")}
        >
          <Menu className="size-5" />
        </DialogPrimitive.Trigger>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-surface shadow-xl focus:outline-none lg:hidden">
            <DialogPrimitive.Title className="flex h-16 items-center border-b border-border px-5">
              <Logo />
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">{t("openMenu")}</DialogPrimitive.Description>
            <div className="h-[calc(100%-4rem)]">
              <SidebarNav workspaces={workspaces} onNavigate={() => setMenuOpen(false)} />
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <Link href="/drive" className="hidden shrink-0 sm:block lg:w-60 lg:pl-3">
        <Logo />
      </Link>

      <SearchBox placeholder={t("searchPlaceholder")} />

      <DropdownMenu>
        <DropdownTrigger
          className="ml-auto flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90"
          aria-label={t("account")}
        >
          {initials(user.fullName ?? user.email)}
        </DropdownTrigger>
        <DropdownContent className="w-64">
          <div className="px-3 py-2">
            {user.fullName ? <p className="truncate text-sm font-medium">{user.fullName}</p> : null}
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <DropdownSeparator />
          <DropdownItem icon={<Settings />} onSelect={() => router.push("/settings")}>
            {t("settings")}
          </DropdownItem>
          <div className="px-3 py-1.5">
            <LanguageSwitcher />
          </div>
          <DropdownSeparator />
          <DropdownItem icon={<LogOut />} onSelect={() => void signOut()}>
            {auth("signOut")}
          </DropdownItem>
        </DropdownContent>
      </DropdownMenu>
    </header>
  );
}

function SearchBox({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  return (
    <form
      role="search"
      className="relative min-w-0 flex-1 lg:max-w-2xl"
      onSubmit={(event) => {
        event.preventDefault();
        const q = String(new FormData(event.currentTarget).get("q") ?? "").trim();
        if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
      }}
    >
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        name="q"
        type="search"
        defaultValue={searchParams.get("q") ?? ""}
        key={searchParams.get("q") ?? ""}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 w-full rounded-full border border-transparent bg-surface-muted pl-10 pr-4 text-sm placeholder:text-muted focus:border-border focus:bg-surface focus:outline-none focus:ring-2 focus:ring-ring/40"
      />
    </form>
  );
}
