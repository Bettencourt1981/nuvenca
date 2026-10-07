import { getFormatter, getTranslations } from "next-intl/server";

/**
 * Sign-ups per day for the last 30 days: one series, so no legend (the title
 * names it). Columns grow from one baseline with a 4px rounded top; hovering
 * a day shows its count; a table carries the same numbers for screen readers.
 */
export async function SignupsChart({ signups }: { signups: { day: string; count: number }[] }) {
  const [t, format] = await Promise.all([getTranslations("admin"), getFormatter()]);
  const byDay = new Map(signups.map((s) => [s.day, s.count]));
  const days = Array.from({ length: 30 }, (_, i) => {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - 29 + i);
    const key = date.toISOString().slice(0, 10);
    return { key, date, count: byDay.get(key) ?? 0 };
  });
  const max = Math.max(1, ...days.map((d) => d.count));
  const label = (d: (typeof days)[number]) =>
    t("signupsDay", { date: format.dateTime(d.date, { day: "numeric", month: "short", timeZone: "UTC" }), count: d.count });

  return (
    <figure>
      <figcaption className="mb-3 text-sm font-medium">{t("signups")}</figcaption>
      <div className="flex gap-2">
        <div className="flex h-32 flex-col justify-between text-right text-xs tabular-nums text-muted" aria-hidden>
          <span>{format.number(max)}</span>
          <span>0</span>
        </div>
        <div className="flex h-32 flex-1 items-end gap-[2px] border-b border-border" aria-hidden>
          {days.map((d) => (
            <div key={d.key} className="group relative flex h-full flex-1 items-end justify-center">
              <div
                className="w-full max-w-6 rounded-t bg-primary"
                style={{ height: d.count ? `${Math.max((d.count / max) * 100, 3)}%` : 0 }}
              />
              <span className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-surface group-hover:block">
                {label(d)}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1 flex justify-between pl-8 text-xs text-muted" aria-hidden>
        <span>{format.dateTime(days[0].date, { day: "numeric", month: "short", timeZone: "UTC" })}</span>
        <span>{format.dateTime(days[29].date, { day: "numeric", month: "short", timeZone: "UTC" })}</span>
      </div>
      <table className="sr-only">
        <caption>{t("signups")}</caption>
        <tbody>
          {days.map((d) => (
            <tr key={d.key}>
              <td>{label(d)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
