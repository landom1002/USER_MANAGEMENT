"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft, Ban, CalendarClock, Crown, GripVertical, History, Loader2, LogOut, MoreHorizontal, Pencil, Plus, Power, RotateCcw,
  Settings2, Star, TriangleAlert, UserPlus, Users, UserX,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AppAlert } from "@/components/common/app-alert";
import {
  buildEvents, buildPeriods, coversDate, fmt, fmtRange, initial, periodAt, type MgrPeriod,
} from "@/lib/org/history";
import type { OrgLookups, OrgMemberHistRow, OrgUnitRow, UnitHistory } from "@/lib/org/types";
import { cn } from "@/lib/utils";
import { useOrgApi } from "./api";
import { ManagerCalendar, Segmented, type CalView } from "./manager-calendar";
import { MemberActionDialog, type MemberAction } from "./member-action-dialog";
import { todayStr, useOrgRules, useRunAction } from "./shared";
import { UnitHistoryLog, type CatFilter } from "./unit-history-log";
import { UnitTitleFields, type UnitEditField } from "./unit-title-fields";

type Props = {
  unit: OrgUnitRow | null;
  units: OrgUnitRow[];
  lookups: OrgLookups;
  onOpenChange: (open: boolean) => void;
  onUnits: (u: OrgUnitRow[]) => void;
  onAddChild: (u: OrgUnitRow) => void;
  onDeactivate: (u: OrgUnitRow) => void;
};

export function MembersDialog({ unit, onOpenChange, ...rest }: Props) {
  return (
    <Dialog open={Boolean(unit)} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(900px,92vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1200px,calc(100%-2rem))]"
        // กด Esc ระหว่างแก้ไขชื่อห้อง = ยกเลิกการแก้ไข ไม่ใช่ปิดหน้าต่าง
        onEscapeKeyDown={(e) => {
          if ((document.activeElement as HTMLElement | null)?.closest("[data-inline-edit]")) e.preventDefault();
        }}
      >
        {/* key = ห้อง -> เปิดห้องใหม่แล้ว state (วันที่เลือก / แท็บ) เริ่มใหม่เสมอ */}
        {unit && <MembersBody key={unit.Unit_ID} unit={unit} {...rest} />}
      </DialogContent>
    </Dialog>
  );
}

function MembersBody({ unit, units, lookups, onUnits, onAddChild, onDeactivate }: Omit<Props, "unit" | "onOpenChange"> & { unit: OrgUnitRow }) {
  const api = useOrgApi();
  const rules = useOrgRules(lookups);
  const unitId = unit.Unit_ID;
  const today = todayStr();

  const [tick, setTick] = useState(0);
  const [data, setData] = useState<{ tick: number; hist: UnitHistory } | null>(null);
  const [action, setAction] = useState<MemberAction | null>(null);
  const [sel, setSel] = useState(today);
  const [view, setView] = useState<CalView>("month");
  const [side, setSide] = useState<"members" | "log">("members");
  const [cat, setCat] = useState<CatFilter>("all");
  const [dragId, setDragId] = useState<number | null>(null);
  const [editing, setEditing] = useState<UnitEditField | null>(null);

  // โหลดประวัติทั้งหมดของห้องเมื่อเปิด / หลังบันทึก (tick) — ระหว่างโหลดยังแสดงข้อมูลเดิม
  useEffect(() => {
    let alive = true;
    const empty: UnitHistory = { rows: [], log: [] };
    api.loadUnitHistory(unitId)
      .then((r) => {
        if (!alive) return;
        if (!r.ok) toast.error(r.error);
        setData((prev) => ({ tick, hist: r.ok ? r.data : prev?.hist ?? empty }));
      })
      .catch(() => {
        if (!alive) return;
        toast.error("โหลดข้อมูลห้องไม่ได้ กรุณาลองใหม่อีกครั้ง");
        setData((prev) => ({ tick, hist: prev?.hist ?? empty }));
      });
    return () => {
      alive = false;
    };
  }, [api, unitId, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const loading = data?.tick !== tick;
  const hist = data?.hist ?? null;

  const { start, periods } = useMemo(() => buildPeriods(hist?.rows ?? [], today), [hist, today]);
  const events = useMemo(
    () => (hist ? buildEvents(hist.rows, hist.log, { unitId, units, lookups, today }) : []),
    [hist, unitId, units, lookups, today],
  );
  const active = useMemo(() => hist?.rows.filter((r) => r.Actived) ?? [], [hist]);

  const color = rules.type(unit.unit_type).color;
  const parent = unit.parent_unit_id != null ? units.find((u) => u.Unit_ID === unit.parent_unit_id) : undefined;
  const warnings = rules.unitWarnings(unit, parent);
  const period = view === "year" ? sel.slice(0, 4) : view === "month" ? sel.slice(0, 7) : sel;
  const pick = (d: string) => setSel(start && d < start ? start : d > today ? today : d);
  const onRowAction = (m: OrgMemberHistRow) => (kind: Exclude<MemberAction["kind"], "add">) =>
    setAction({ kind, unit, member: m } as MemberAction);

  // เปลี่ยนหัวหน้าด้วยการลากวาง — ทำได้เฉพาะตอนดูวันนี้ (วันที่มีผล = วันนี้)
  const isToday = sel === today;
  const curMgr = active.find((r) => r.is_manager && coversDate(r, today)) ?? null;
  const { run, pending: swapping } = useRunAction(onUnits);
  const replaceWith = async (memberId: number) => {
    const m = active.find((r) => r.Member_ID === memberId);
    if (!isToday || !m || m.is_manager || !coversDate(m, today)) return;
    const ok = await run(api.replaceManager({ memberId, date: today }), `ตั้ง ${m.Name ?? m.UserCode} เป็นหัวหน้าแทนแล้ว`);
    if (ok) reload();
  };

  return (
    <>
      <DialogHeader
        className="flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b py-3 pr-12 pl-5 text-left"
        // แถบสีประเภทห้องด้านซ้ายของหัวการ์ด
        style={{ boxShadow: `inset 4px 0 0 ${color}` }}
      >
        <UnitTitleFields
          unit={unit} lookups={lookups} loading={loading && Boolean(hist)} onUnits={onUnits}
          editing={editing} onEditing={setEditing}
        />
        <div className="flex shrink-0 items-center gap-1.5">
          <Button size="sm" onClick={() => setAction({ kind: "add", unit })}>
            <UserPlus /> เพิ่มคน
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="outline" aria-label="จัดการห้อง">
                <Settings2 />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              // เลือก "แก้..." แล้วอย่าคืนโฟกัสให้ปุ่ม ไม่งั้น input inline จะ blur ทันที
              onCloseAutoFocus={(e) => editing && e.preventDefault()}
            >
              <DropdownMenuItem onSelect={() => setEditing("code")}>
                <Pencil /> แก้รหัสห้อง
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setEditing("name")}>
                <Pencil /> แก้ชื่อห้อง
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onAddChild(unit)}>
                <Plus /> เพิ่มห้องลูก
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => onDeactivate(unit)}>
                <Power /> ปิดห้อง
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </DialogHeader>

      {warnings.length > 0 && (
        <div className="border-b px-5 py-2.5">
          <AppAlert tone="warning" icon={<TriangleAlert />} title="ห้องนี้ผิดกฎ" description={warnings.join(" · ")} />
        </div>
      )}

      {!hist ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> กำลังโหลดข้อมูลห้อง...
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_420px] lg:overflow-hidden">
          {/* ซ้าย: ปฏิทินหัวหน้า */}
          <div className="border-b px-5 pt-4 pb-5 lg:overflow-y-auto lg:border-r lg:border-b-0">
            {start ? (
              <ManagerCalendar
                start={start} today={today} periods={periods} events={events}
                sel={sel} onSel={setSel} view={view} onView={setView}
              />
            ) : (
              <div className="flex h-40 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-sm text-muted-foreground">
                <CalendarClock className="size-5" />
                ห้องนี้ยังไม่เคยมีสมาชิก — ยังไม่มีปฏิทินหัวหน้า
              </div>
            )}
          </div>

          {/* ขวา: ข้อมูล ณ วันที่เลือก */}
          <div className="flex flex-col gap-3.5 bg-muted/30 px-4 pt-4 pb-5 lg:overflow-y-auto">
            {sel !== today && (
              <AppAlert
                tone="info"
                icon={<CalendarClock />}
                className="items-center has-data-[slot=alert-action]:pr-32"
                title={<>กำลังดูข้อมูลย้อนหลัง ณ วันที่ <span className="font-mono">{fmt(sel)}</span></>}
                action={
                  <Button size="xs" variant="outline" onClick={() => setSel(today)}>
                    <RotateCcw /> กลับไปวันนี้
                  </Button>
                }
              />
            )}

            <ManagerCard
              p={start ? periodAt(periods, sel) : null}
              droppable={isToday && dragId != null}
              pending={swapping}
              onDrop={() => {
                const id = dragId;
                setDragId(null);
                if (id != null) replaceWith(id);
              }}
              onRemove={isToday && curMgr ? () => setAction({ kind: "manager", unit, member: curMgr }) : undefined}
            />

            <Segmented
              value={side}
              onChange={setSide}
              className="bg-muted"
              options={[
                ["members", <><Users /> สมาชิก{sel === today ? "ตอนนี้" : "ตอนนั้น"} ({active.filter((r) => coversDate(r, sel)).length})</>],
                ["log", <><History /> ประวัติ ({events.length})</>],
              ]}
            />

            {side === "members" ? (
              <MembersAt
                rows={active} sel={sel} today={today} periods={periods} onAction={onRowAction}
                canDrag={isToday && !swapping} onDrag={setDragId}
              />
            ) : (
              <UnitHistoryLog events={events} cat={cat} onCat={setCat} period={period} today={today} onPick={pick} />
            )}
          </div>
        </div>
      )}

      <MemberActionDialog
        action={action}
        units={units}
        lookups={lookups}
        members={active}
        onClose={() => setAction(null)}
        onDone={(next) => {
          onUnits(next);
          reload();
        }}
      />
    </>
  );
}

function Avatar({ name, p, size = "sm" }: { name: string | null; p?: MgrPeriod | null; size?: "sm" | "lg" }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground",
        size === "lg" ? "size-[38px] text-sm" : "size-[26px] text-[11px]",
      )}
      style={p && !p.vacant ? { background: p.tone.light, color: p.tone.text } : undefined}
    >
      {p?.vacant ? "–" : initial(name)}
    </span>
  );
}

function ManagerCard({ p, droppable, pending, onDrop, onRemove }: {
  p: MgrPeriod | null;
  /** กำลังลากสมาชิกอยู่ และดูวันนี้ -> รับการวางได้ */
  droppable: boolean;
  pending: boolean;
  onDrop: () => void;
  /** มี = แสดงปุ่มถอดหัวหน้าตอน hover (เฉพาะวันนี้ที่มีหัวหน้า) */
  onRemove?: () => void;
}) {
  const [over, setOver] = useState(false);
  const has = p && !p.vacant;
  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 rounded-xl border bg-card px-3.5 py-3 transition-colors",
        droppable && "border-dashed border-primary/60 bg-primary/5",
        droppable && over && "border-solid border-primary bg-primary/10 ring-2 ring-primary/30",
      )}
      style={has && !droppable ? { borderColor: p.tone.border } : undefined}
      onDragOver={(e) => {
        if (!droppable) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!over) setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        setOver(false);
        if (!droppable) return;
        e.preventDefault();
        onDrop();
      }}
    >
      <Avatar name={has ? p.name : null} p={p ?? { vacant: true } as MgrPeriod} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground [&_svg]:size-3">
          <Crown /> หัวหน้าตอนนั้น
        </span>
        <span className="truncate text-sm font-semibold">{has ? p.name : "ไม่มีหัวหน้า"}</span>
        <span className="truncate text-[11.5px] text-muted-foreground">
          {has
            ? `${p.code} · ${p.pos} · ${fmtRange(p.start, p.end)}`
            : p ? `ว่าง ${fmtRange(p.start, p.end)} · สายอนุมัติขึ้นไปห้องแม่` : "วันนี้ห้องยังไม่มีสมาชิก"}
        </span>
      </div>
      {onRemove && !droppable && !pending && (
        <Button
          size="xs"
          variant="outline"
          className="shrink-0 text-destructive opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive"
          onClick={onRemove}
        >
          <UserX /> ถอดหัวหน้า
        </Button>
      )}
      {droppable && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-card/85 text-sm font-medium text-primary">
          <Crown className="mr-1.5 size-4" /> วางเพื่อตั้งเป็นหัวหน้า{has ? "แทน" : ""}
        </span>
      )}
      {pending && (
        <span className="absolute inset-0 flex items-center justify-center gap-2 rounded-xl bg-card/85 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> กำลังเปลี่ยนหัวหน้า...
        </span>
      )}
    </div>
  );
}

function MembersAt({ rows, sel, today, periods, onAction, canDrag, onDrag }: {
  rows: OrgMemberHistRow[];
  sel: string;
  today: string;
  periods: MgrPeriod[];
  onAction: (m: OrgMemberHistRow) => (kind: Exclude<MemberAction["kind"], "add">) => void;
  /** ลากสมาชิก (ที่ไม่ใช่หัวหน้า) ไปวางบนการ์ดหัวหน้าได้ */
  canDrag: boolean;
  onDrag: (memberId: number | null) => void;
}) {
  const sort = (a: OrgMemberHistRow, b: OrgMemberHistRow) =>
    Number(b.is_manager) - Number(a.is_manager) || (b.rank_no ?? 0) - (a.rank_no ?? 0) || a.UserCode.localeCompare(b.UserCode);
  const at = rows.filter((r) => coversDate(r, sel)).sort(sort);
  const upcoming = sel === today ? rows.filter((r) => r.start_date && r.start_date > today).sort(sort) : [];
  const mgrPeriod = periodAt(periods, sel);

  return (
    <div className="flex flex-col gap-3">
      {at.length === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          {sel === today ? "ตอนนี้ไม่มีคนในห้องนี้" : "วันนั้นไม่มีคนในห้องนี้"}
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-lg border bg-card">
          {at.map((m) => (
            <MemberRow
              key={m.Member_ID} m={m} today={today} p={m.is_manager ? mgrPeriod : null} onAction={onAction(m)}
              draggable={canDrag && !m.is_manager} gutter={canDrag} onDrag={onDrag}
            />
          ))}
        </ul>
      )}
      {upcoming.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 px-1 text-xs font-semibold text-muted-foreground [&_svg]:size-3.5">
            <CalendarClock /> จะเข้าห้อง (ล่วงหน้า) ({upcoming.length})
          </span>
          <ul className="divide-y overflow-hidden rounded-lg border border-dashed bg-card">
            {upcoming.map((m) => (
              <MemberRow key={m.Member_ID} m={m} today={today} p={null} onAction={onAction(m)} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function MemberRow({ m, today, p, onAction, draggable = false, gutter = false, onDrag }: {
  m: OrgMemberHistRow;
  today: string;
  p: MgrPeriod | null;
  onAction: (kind: Exclude<MemberAction["kind"], "add">) => void;
  draggable?: boolean;
  /** แสดงคอลัมน์ที่จับลากหน้า avatar */
  gutter?: boolean;
  onDrag?: (memberId: number | null) => void;
}) {
  const past = Boolean(m.end_date && m.end_date < today);
  const future = Boolean(m.start_date && m.start_date > today);
  const tag = m.is_manager
    ? { label: "หัวหน้า", cls: "border-transparent bg-amber-500 text-white" }
    : past
      ? { label: `ออก ${fmt(m.end_date)}`, cls: "text-muted-foreground" }
      : future
        ? { label: `เริ่ม ${fmt(m.start_date)}`, cls: "text-muted-foreground" }
        : { label: "ยังอยู่", cls: "border-transparent bg-muted" };
  return (
    <li
      className={cn("flex items-center gap-2.5 py-2 pr-1.5 pl-2.5", draggable && "cursor-grab hover:bg-muted/40 active:cursor-grabbing")}
      draggable={draggable}
      onDragStart={draggable ? (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(m.Member_ID));
        onDrag?.(m.Member_ID);
      } : undefined}
      // ผูกไว้เสมอ: ตอนวาง draggable จะกลายเป็น false (กำลังบันทึก) ก่อน dragend ยิง — ถ้าถอด handler ออก dragId จะค้าง
      onDragEnd={() => onDrag?.(null)}
    >
      {gutter && (
        // ที่จับลาก — แถวที่ลากไม่ได้ (หัวหน้า) เว้นที่ว่างไว้ให้ avatar ตรงกัน
        <GripVertical className={cn("-mr-1.5 size-3.5 shrink-0 text-muted-foreground/70", !draggable && "invisible")} aria-hidden />
      )}
      <Avatar name={m.Name ?? m.UserCode} p={p} />
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[12.5px] font-medium">{m.Name ?? "-"}</span>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{m.UserCode}</span>
          {m.is_primary && <Star className="size-3 shrink-0 fill-current text-muted-foreground" aria-label="ห้องหลัก" />}
        </span>
        <span className="truncate text-[11px] text-muted-foreground">
          {[m.PositionCode, m.Position].filter(Boolean).join(" - ") || "-"} · {fmtRange(m.start_date, m.end_date)}
        </span>
      </div>
      <span className={cn("shrink-0 rounded-full border px-[7px] py-0.5 text-[10.5px] font-medium whitespace-nowrap", tag.cls)}>
        {tag.label}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label="จัดการ">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!past && (
            <>
              <DropdownMenuItem onSelect={() => onAction("move")}>
                <ArrowRightLeft /> ย้ายห้อง
              </DropdownMenuItem>
              {!m.is_primary && (
                <DropdownMenuItem onSelect={() => onAction("primary")}>
                  <Star /> ตั้งเป็นห้องหลัก
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => onAction("manager")}>
                {m.is_manager ? <><UserX /> ถอดหัวหน้า</> : <><Crown /> ตั้งเป็นหัวหน้า</>}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAction("end")}>
                <LogOut /> ให้ออกจากห้อง
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onSelect={() => onAction("edit")}>
            <Pencil /> แก้ไขข้อมูล (กรอกผิด)
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => onAction("cancel")}>
            <Ban /> ยกเลิกรายการ
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
