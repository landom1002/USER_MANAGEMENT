"use client";

import type { ReactNode } from "react";

import { CalendarDays, ChevronLeft, ChevronRight, Crown, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  addDays, daysBetween, daysInMonth, duration, EVENT_TYPES, eventTone, fmt, fmtRange, iso, maxDate, minDate, periodAt,
  weekdayMon, type MgrPeriod, type UnitEvent,
} from "@/lib/org/history";
import { cn } from "@/lib/utils";
import { EventIcon } from "./unit-history-log";

export type CalView = "year" | "month" | "week";

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const MONTHS_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const WEEKDAYS = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];

type Props = {
  start: string; // วันแรกที่ห้องมีคน
  today: string;
  periods: MgrPeriod[];
  events: UnitEvent[];
  sel: string;
  onSel: (d: string) => void;
  view: CalView;
  onView: (v: CalView) => void;
};

export function ManagerCalendar(p: Props) {
  const clamp = (d: string) => minDate(maxDate(d, p.start), p.today);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold [&_svg]:size-4">
          <CalendarDays /> ปฏิทินหัวหน้าห้อง
        </span>
        <Segmented
          value={p.view}
          onChange={p.onView}
          options={[["year", "รายปี"], ["month", "รายเดือน"], ["week", "รายสัปดาห์"]]}
        />
      </div>

      {p.view === "year" && <YearView {...p} clamp={clamp} />}
      {p.view === "month" && <MonthView {...p} clamp={clamp} />}
      {p.view === "week" && <WeekView {...p} clamp={clamp} />}

      <Legend {...p} clamp={clamp} />
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: {
  value: T;
  onChange: (v: T) => void;
  options: [T, ReactNode][];
  className?: string;
}) {
  return (
    <div className={cn("flex gap-0.5 rounded-lg bg-muted p-[3px]", className)}>
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors [&_svg]:size-3.5",
            value === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

type ViewProps = Props & { clamp: (d: string) => string };

/** ช่วงของหัวหน้าแต่ละคนที่ทับ [a, b] (ตัดที่ start / today) — ความกว้างเป็น % ของ [a, b] */
function segments(periods: MgrPeriod[], a: string, b: string, start: string, today: string) {
  const total = daysBetween(a, b) + 1;
  return periods.flatMap((q) => {
    const s = maxDate(a, q.start, start);
    const e = minDate(b, q.end ?? today, today);
    if (e < s) return [];
    return [{ key: q.key, w: `${(((daysBetween(s, e) + 1) / total) * 100).toFixed(2)}%`, q }];
  });
}

function YearView({ start, today, periods, sel, onSel, clamp }: ViewProps) {
  const y0 = Number(start.slice(0, 4));
  const y1 = Number(today.slice(0, 4));
  const years = Array.from({ length: y1 - y0 + 1 }, (_, i) => y1 - i);
  const selKey = sel.slice(0, 7);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-[44px_repeat(12,minmax(0,1fr))] gap-1 text-center text-[11px] text-muted-foreground">
        <span />
        {MONTHS.map((m) => <span key={m}>{m}</span>)}
      </div>
      {years.map((y) => (
        <div key={y} className="grid grid-cols-[44px_repeat(12,minmax(0,1fr))] items-center gap-1">
          <span className="font-mono text-xs font-medium text-muted-foreground">{y}</span>
          {MONTHS.map((label, m) => {
            const ms = iso(y, m, 1);
            const me = iso(y, m, daysInMonth(y, m));
            const off = ms > today || me < start;
            const segs = off ? [] : segments(periods, ms, me, start, today);
            const isNow = ms <= today && today <= me;
            const who = [...new Set(segs.map((s) => s.q.name))].join(" → ");
            return (
              <button
                key={m}
                type="button"
                disabled={off}
                title={`${label} ${y}${who ? ` · ${who}` : ""}`}
                onClick={() => onSel(isNow ? today : clamp(iso(y, m, 15)))}
                className={cn(
                  "relative flex h-8 overflow-hidden rounded-md outline-offset-2",
                  off ? "border border-dashed" : "cursor-pointer bg-muted ring-1 ring-background/60 ring-inset",
                  ms.slice(0, 7) === selKey && "outline-2 outline-foreground",
                )}
              >
                {segs.map((s) => (
                  <span key={s.key} style={{ width: s.w, background: s.q.tone.mid }} />
                ))}
                {isNow && <TodayDot className="top-[3px] right-[3px]" />}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function NavHeader({ label, onPrev, onNext, prevOff, nextOff }: {
  label: string; onPrev: () => void; onNext: () => void; prevOff: boolean; nextOff: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[15px] font-semibold">{label}</span>
      <div className="flex gap-1">
        <Button size="icon-sm" variant="outline" disabled={prevOff} onClick={onPrev} aria-label="ก่อนหน้า">
          <ChevronLeft />
        </Button>
        <Button size="icon-sm" variant="outline" disabled={nextOff} onClick={onNext} aria-label="ถัดไป">
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

function MonthView({ start, today, periods, sel, onSel, clamp }: ViewProps) {
  const y = Number(sel.slice(0, 4));
  const m = Number(sel.slice(5, 7)) - 1;
  const nd = daysInMonth(y, m);
  const lead = weekdayMon(iso(y, m, 1));
  const shift = (d: number) => {
    const t = new Date(Date.UTC(y, m + d, 1));
    const ty = t.getUTCFullYear();
    const tm = t.getUTCMonth();
    const isNow = today.slice(0, 7) === iso(ty, tm, 1).slice(0, 7);
    onSel(isNow ? today : clamp(iso(ty, tm, 15)));
  };
  // ชื่อขึ้นเฉพาะวันแรกของช่วง (หรือวันแรกของเดือนที่อยู่ในช่วง)
  const days = Array.from({ length: nd }, (_, i) => {
    const ds = iso(y, m, i + 1);
    const off = ds > today || ds < start;
    return { ds, off, q: off ? null : periodAt(periods, ds) };
  });
  const cells = days.map((d, i) => ({ ...d, change: Boolean(d.q && d.q.key !== days[i - 1]?.q?.key) }));
  return (
    <div className="flex flex-col gap-2">
      <NavHeader
        label={`${MONTHS_FULL[m]} ${y}`}
        onPrev={() => shift(-1)}
        onNext={() => shift(1)}
        prevOff={iso(y, m, 1) <= start}
        nextOff={iso(y, m, nd) >= today}
      />
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
        {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
        {cells.map(({ ds, off, q, change }, i) => {
          return (
            <button
              key={ds}
              type="button"
              disabled={off}
              onClick={() => onSel(ds)}
              title={q ? `${fmt(ds)} · ${q.name}` : fmt(ds)}
              className={cn(
                "relative flex h-12 flex-col justify-between rounded-md border px-1.5 py-1 text-left outline-offset-2",
                off ? "border-dashed text-muted-foreground" : "cursor-pointer",
                ds === sel && "outline-2 outline-foreground",
              )}
              style={q ? { background: q.vacant ? q.tone.mid : q.tone.light, borderColor: q.tone.border, color: q.tone.text } : undefined}
            >
              <span className="font-mono text-xs font-semibold">{i + 1}</span>
              <span className="truncate text-[10px] font-medium">{change && q ? (q.vacant ? "ว่าง" : q.name.split(" ")[0]) : ""}</span>
              {ds === today && <TodayDot className="top-1 right-1.5" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({ start, today, periods, events, sel, onSel, clamp }: ViewProps) {
  const mon = addDays(sel, -weekdayMon(sel));
  const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  return (
    <div className="flex flex-col gap-2">
      <NavHeader
        label={`สัปดาห์ ${fmt(days[0]).slice(0, 5)} – ${fmt(days[6])}`}
        onPrev={() => onSel(clamp(addDays(sel, -7)))}
        onNext={() => onSel(clamp(addDays(sel, 7)))}
        prevOff={days[0] <= start}
        nextOff={days[6] >= today}
      />
      <div className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))] gap-1">
        <span />
        {days.map((ds, i) => {
          const off = ds > today || ds < start;
          return (
            <button
              key={ds}
              type="button"
              disabled={off}
              onClick={() => onSel(ds)}
              className={cn(
                "flex flex-col items-center rounded-md py-1 outline-offset-1",
                ds === sel && "bg-primary/10 outline-2 outline-foreground",
              )}
            >
              <span className="text-[11px] text-muted-foreground">{WEEKDAYS[i]}</span>
              <span className={cn("font-mono text-sm font-semibold", ds === today ? "text-primary" : off && "text-muted-foreground")}>
                {Number(ds.slice(8, 10))}
              </span>
            </button>
          );
        })}

        <RowLabel icon={<Crown />} label="หัวหน้า" />
        {days.map((ds) => {
          const off = ds > today || ds < start;
          const q = off ? null : periodAt(periods, ds);
          return (
            <div
              key={ds}
              title={q?.name}
              className={cn(
                "flex h-11 items-center truncate rounded-md border px-1.5 text-[11px] font-semibold",
                off && "border-dashed text-muted-foreground",
              )}
              style={q ? { background: q.tone.mid, borderColor: "transparent", color: q.vacant ? undefined : q.tone.text } : undefined}
            >
              {off ? (ds > today ? "ยังไม่ถึง" : "") : q?.vacant ? "ว่าง" : q?.name}
            </div>
          );
        })}

        <RowLabel icon={<History />} label="เหตุการณ์" top />
        {days.map((ds) => (
          <div key={ds} className="flex min-h-48 min-w-0 flex-col gap-1 rounded-md border bg-card p-1">
            {events.filter((e) => e.date === ds).map((e) => {
              const t = eventTone(e.type);
              return (
                <div
                  key={e.key}
                  title={`${EVENT_TYPES[e.type].label} · ${e.name}`}
                  className="flex min-w-0 items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium [&_svg]:size-2.5 [&_svg]:shrink-0"
                  style={{ background: t.light, color: t.text }}
                >
                  <EventIcon type={e.type} />
                  <span className="truncate">{e.name.split(" ")[0]}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function RowLabel({ icon, label, top }: { icon: ReactNode; label: string; top?: boolean }) {
  return (
    <span className={cn(
      "flex gap-1 text-[11.5px] font-semibold text-muted-foreground [&_svg]:size-3",
      top ? "items-start pt-1.5" : "items-center",
    )}>
      {icon}
      {label}
    </span>
  );
}

function Legend({ today, periods, onSel, clamp }: ViewProps) {
  if (!periods.length) return null;
  return (
    <div className="flex flex-col gap-1.5 pt-1">
      <span className="text-xs font-semibold text-muted-foreground">ช่วงหัวหน้า</span>
      <div className="grid gap-2 sm:grid-cols-2">
        {[...periods].reverse().map((q) => (
          <button
            key={q.key}
            type="button"
            onClick={() => onSel(clamp(q.start))}
            className="flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors hover:bg-muted/60"
          >
            <span className="size-3.5 shrink-0 rounded" style={{ background: q.tone.mid }} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[12.5px] font-medium">{q.name}</span>
              <span className="font-mono text-[11px] whitespace-nowrap text-muted-foreground">{fmtRange(q.start, q.end)}</span>
            </span>
            <span className="text-[11px] whitespace-nowrap text-muted-foreground">{duration(q.start, q.end, today)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const TodayDot = ({ className }: { className?: string }) => (
  <span className={cn("absolute size-1.5 rounded-full bg-primary ring-[1.5px] ring-background", className)} />
);
