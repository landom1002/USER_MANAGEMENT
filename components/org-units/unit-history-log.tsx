"use client";

import {
  ArrowRight, ArrowRightFromLine, ArrowRightToLine, Ban, Briefcase, Building2, CalendarPlus, CalendarRange, Crown, GitBranch, LogOut,
  Merge, Network, Pencil, PencilLine, Power, RotateCcw, Star, StarOff, UserPlus, UserX, type LucideIcon,
} from "lucide-react";
import { CATS, catTone, EVENT_TYPES, eventTone, fmt, fmtStamp, type EventCat, type EventType, type UnitEvent } from "@/lib/org/history";
import { cn } from "@/lib/utils";

const ICONS: Record<EventType, LucideIcon> = {
  in: UserPlus, future: CalendarPlus, movein: ArrowRightToLine, moveout: ArrowRightFromLine, out: LogOut, position: Briefcase,
  mgr: Crown, unmgr: UserX, primary: Star, unprimary: StarOff,
  ucreate: Building2, uedit: Pencil, uclose: Power, uopen: RotateCcw, parent: GitBranch, child: Network,
  extend: CalendarRange, merge: Merge, mgrextend: CalendarRange, mgrmerge: Merge,
  edit: PencilLine, cancel: Ban,
};

export function EventIcon({ type }: { type: EventType }) {
  const Icon = ICONS[type];
  return <Icon />;
}

export type CatFilter = "all" | EventCat;

/** รายการประวัติ — จัดกลุ่มตามปี · แถวที่อยู่ในช่วงที่เลือก (period) ถูกไฮไลต์ · คลิกเพื่อย้อนดูวันนั้น */
export function UnitHistoryLog({ events, cat, onCat, period, today, onPick }: {
  events: UnitEvent[];
  cat: CatFilter;
  onCat: (c: CatFilter) => void;
  period: string; // yyyy / yyyy-mm / yyyy-mm-dd
  today: string;
  onPick: (d: string) => void;
}) {
  const counts: Record<string, number> = { all: events.length };
  for (const e of events) {
    const c = EVENT_TYPES[e.type].cat;
    counts[c] = (counts[c] ?? 0) + 1;
  }
  const shown = cat === "all" ? events : events.filter((e) => EVENT_TYPES[e.type].cat === cat);
  const groups: { year: string; items: UnitEvent[] }[] = [];
  for (const e of shown) {
    const y = e.date.slice(0, 4);
    if (groups.at(-1)?.year !== y) groups.push({ year: y, items: [] });
    groups.at(-1)!.items.push(e);
  }

  const chips: [CatFilter, string, string][] = [
    ["all", "ทั้งหมด", "var(--foreground)"],
    ...(Object.keys(CATS) as EventCat[]).map((k): [CatFilter, string, string] => [k, CATS[k].label, catTone(k).solid]),
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap gap-1.5">
          {chips.map(([k, label, dot]) => (
            <button
              key={k}
              type="button"
              onClick={() => onCat(k)}
              className={cn(
                "flex h-6.5 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-medium whitespace-nowrap transition-colors",
                cat === k ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted",
              )}
            >
              <span className="size-[7px] rounded-full" style={{ background: dot }} />
              {label}
              <span className="opacity-70">{counts[k] ?? 0}</span>
            </button>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground">
        </span>
      </div>

      <div className="rounded-lg border bg-card py-1">
        {groups.length === 0 && (
          <div className="flex h-20 items-center justify-center text-xs text-muted-foreground">ไม่มีประวัติ</div>
        )}
        {groups.map((g) => (
          <div key={g.year} className="flex flex-col">
            <div className="sticky top-0 z-[1] bg-card px-3 pt-2 pb-1 font-mono text-[11px] font-semibold text-muted-foreground">
              {g.year}
            </div>
            {g.items.map((e) => {
              const t = eventTone(e.type);
              const future = e.date > today;
              return (
                <button
                  key={e.key}
                  type="button"
                  disabled={future}
                  onClick={() => onPick(e.date)}
                  className={cn(
                    "flex gap-2.5 px-3 py-1.5 text-left transition-colors enabled:hover:bg-muted/60",
                    e.date.startsWith(period) && "bg-primary/[0.07]",
                  )}
                >
                  <span className="relative flex w-[22px] shrink-0 justify-center">
                    <span className="absolute top-0 -bottom-1.5 w-px bg-border" />
                    <span
                      className="relative flex size-[22px] items-center justify-center rounded-full [&_svg]:size-3"
                      style={{ background: t.light, color: t.text }}
                    >
                      <EventIcon type={e.type} />
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="flex justify-between gap-2">
                      <span className="text-xs font-semibold whitespace-nowrap" style={{ color: t.text }}>
                        {EVENT_TYPES[e.type].label}
                      </span>
                      <span className="font-mono text-[11px] whitespace-nowrap text-muted-foreground">{fmt(e.date)}</span>
                    </span>
                    <span className={cn("truncate text-[12.5px] font-medium", e.struck && "line-through")}>{e.name}</span>
                    {e.sub && <span className="text-[11px] text-pretty text-muted-foreground">{e.sub}</span>}
                    {e.diffs.map((d) => (
                      <span key={d.field} className="mt-0.5 flex flex-wrap items-center gap-1.5 rounded-md bg-muted/70 px-2 py-1 text-[11px] [&_svg]:size-3">
                        <span className="text-muted-foreground">{d.field}</span>
                        <span className="text-red-600 line-through dark:text-red-400">{d.old}</span>
                        <ArrowRight />
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">{d.new}</span>
                      </span>
                    ))}
                    {(e.by || e.at) && (
                      <span className="mt-0.5 text-[10.5px] text-muted-foreground/80">
                        {e.by && <>โดย <span className="font-mono">{e.by}</span></>}
                        {e.by && e.at && " · "}
                        {e.at && `บันทึก ${fmtStamp(e.at)}`}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
