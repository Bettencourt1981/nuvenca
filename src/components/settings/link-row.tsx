import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";

/** A settings row that opens another page. */
export function LinkRow({ href, icon, label, hint }: { href: string; icon: ReactNode; label: string; hint?: string }) {
  return (
    <Link href={href} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-surface-hover">
      <span className="text-muted [&>svg]:size-5" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {hint ? <span className="block truncate text-sm text-muted">{hint}</span> : null}
      </span>
      <ChevronRight className="size-4 text-muted" aria-hidden />
    </Link>
  );
}
