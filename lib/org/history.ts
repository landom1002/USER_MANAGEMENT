// ประวัติห้อง: ช่วงหัวหน้า + เหตุการณ์ — คำนวณจาก UnitHistory (ใช้ฝั่ง client)
//
// ที่มาของข้อมูล
// - เข้า / ออก / ย้าย / หัวหน้า / ห้องหลัก : จากช่วงวันที่ของแถว Org_Member (ข้อมูลจริงปัจจุบัน — มีครบแม้ข้อมูลยุค migration ที่ไม่มี log)
// - แก้ทับแถว / ยกเลิก / ข้อมูลห้อง / ห้องลูก : จาก Org_ChangeLog (Org_Member ไม่เก็บค่าเดิมไว้)

import type { OrgLogRow, OrgLookups, OrgMemberHistRow, OrgUnitRow } from "./types";

// ---------------------------------------------------------------- วันที่ (yyyy-mm-dd, คิดแบบ UTC เลี่ยง timezone)

const DAY = 86_400_000;
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (d: string, n: number) => fromMs(toMs(d) + n * DAY);
export const daysBetween = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / DAY);
export const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
/** 0 = จันทร์ ... 6 = อาทิตย์ */
export const weekdayMon = (d: string) => (new Date(toMs(d)).getUTCDay() + 6) % 7;
export const minDate = (...d: string[]) => d.reduce((a, b) => (b < a ? b : a));
export const maxDate = (...d: string[]) => d.reduce((a, b) => (b > a ? b : a));

export const fmt = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");
/** yyyy-mm-dd hh:mi -> dd/mm/yyyy hh:mi */
export const fmtStamp = (s: string | null) => (s ? `${fmt(s.slice(0, 10))} ${s.slice(11, 16)}`.trim() : "");
export const fmtRange = (s: string | null, e: string | null) => `${fmt(s) || "ไม่ระบุ"} – ${e ? fmt(e) : "ปัจจุบัน"}`;

/** ระยะเวลาแบบ "2 ปี 5 เดือน" (นับถึง e หรือ today) */
export function duration(s: string, e: string | null, today: string): string {
  const end = e ?? today;
  const [sy, sm, sd] = s.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  let m = (ey - sy) * 12 + em - sm;
  if (ed < sd - 1) m--;
  m = Math.max(m, 0);
  const y = Math.floor(m / 12);
  const mm = m % 12;
  if (!y && !mm) return "ไม่ถึงเดือน";
  return [y ? `${y} ปี` : "", mm ? `${mm} เดือน` : ""].filter(Boolean).join(" ");
}

/** อักษรตัวแรกของชื่อ (ข้ามสระหน้า เ แ โ ใ ไ) */
export function initial(name: string | null): string {
  if (!name) return "?";
  for (const ch of name) if (!"เแโใไ ".includes(ch)) return ch;
  return name[0];
}

// ---------------------------------------------------------------- สี

/** โทนสีจาก hue — ผสมกับ token ของธีม ใช้ได้ทั้งโหมดสว่างและมืด */
export type Tone = { solid: string; mid: string; light: string; text: string; border: string };

export const hueTone = (h: number, chroma = 0.13): Tone => {
  const solid = `oklch(0.62 ${chroma} ${h})`;
  return {
    solid,
    mid: `oklch(0.8 ${chroma * 0.7} ${h})`,
    light: `color-mix(in oklch, ${solid} 14%, var(--card))`,
    text: `color-mix(in oklch, ${solid} 70%, var(--foreground))`,
    border: `color-mix(in oklch, ${solid} 45%, var(--card))`,
  };
};

export const HATCH =
  "repeating-linear-gradient(135deg, color-mix(in oklch, var(--muted-foreground) 35%, transparent) 0 3px, transparent 3px 7px)";

export const VACANT_TONE: Tone = {
  solid: HATCH,
  mid: HATCH,
  light: "var(--muted)",
  text: "var(--muted-foreground)",
  border: "var(--border)",
};

const MGR_HUES = [255, 330, 175, 40, 300, 130, 20, 210, 80, 0];

// ---------------------------------------------------------------- ช่วงหัวหน้า

export type MgrPeriod = {
  key: string;
  vacant: boolean;
  userId: number | null;
  name: string;
  code: string;
  pos: string;
  start: string;
  end: string | null; // null = ยังเป็นอยู่
  tone: Tone;
};

const posLabel = (r: Pick<OrgMemberHistRow, "PositionCode" | "Position">) =>
  [r.PositionCode, r.Position].filter(Boolean).join(" - ") || "-";

/**
 * ช่วงหัวหน้าเรียงตามเวลา ตั้งแต่วันแรกที่ห้องมีคน (start) ถึงวันนี้ — ช่องว่างระหว่างช่วง = ไม่มีหัวหน้า
 * แถวหัวหน้าของคนเดียวกันที่ต่อกันพอดี (ถูกแบ่งเพราะเปลี่ยนห้องหลัก ฯลฯ) รวมเป็นช่วงเดียว
 */
export function buildPeriods(rows: OrgMemberHistRow[], today: string): { start: string | null; periods: MgrPeriod[] } {
  const act = rows.filter((r) => r.Actived && r.start_date && r.start_date <= today);
  const start = act.map((r) => r.start_date!).sort()[0] ?? null;
  if (!start) return { start: null, periods: [] };

  const mgr = act.filter((r) => r.is_manager).sort((a, b) => a.start_date!.localeCompare(b.start_date!));
  const hueOf = new Map<number, number>();
  const merged: MgrPeriod[] = [];
  for (const r of mgr) {
    const last = merged.at(-1);
    if (last && last.userId === r.UserID && last.end && addDays(last.end, 1) === r.start_date) {
      last.end = r.end_date;
      last.pos = posLabel(r);
      continue;
    }
    if (!hueOf.has(r.UserID)) hueOf.set(r.UserID, MGR_HUES[hueOf.size % MGR_HUES.length]);
    merged.push({
      key: `m${r.Member_ID}`, vacant: false, userId: r.UserID, name: r.Name ?? r.UserCode, code: r.UserCode,
      pos: posLabel(r), start: r.start_date!, end: r.end_date, tone: hueTone(hueOf.get(r.UserID)!),
    });
  }

  const vacant = (s: string, e: string | null): MgrPeriod => ({
    key: `v${s}`, vacant: true, userId: null, name: "ไม่มีหัวหน้า", code: "", pos: "ช่วงว่างหัวหน้า", start: s, end: e, tone: VACANT_TONE,
  });
  const out: MgrPeriod[] = [];
  let cursor: string | null = start;
  for (const p of merged) {
    if (cursor && p.start > cursor) out.push(vacant(cursor, addDays(p.start, -1)));
    out.push(p);
    const next: string | null = p.end ? addDays(p.end, 1) : null;
    cursor = cursor && next ? maxDate(cursor, next) : null;
    if (!cursor) break;
  }
  if (cursor && cursor <= today) out.push(vacant(cursor, null));
  return { start, periods: out };
}

export const periodAt = (periods: MgrPeriod[], d: string) =>
  periods.find((p) => p.start <= d && (!p.end || p.end >= d)) ?? null;

/** แถวที่อยู่ในห้อง ณ วันที่ d */
export const coversDate = (r: Pick<OrgMemberHistRow, "start_date" | "end_date">, d: string) =>
  (!r.start_date || r.start_date <= d) && (!r.end_date || r.end_date >= d);

// ---------------------------------------------------------------- เหตุการณ์

export type EventCat = "member" | "mgr" | "primary" | "unit" | "fix";
export type EventType =
  | "in" | "future" | "movein" | "moveout" | "out" | "position"
  | "mgr" | "unmgr" | "primary" | "unprimary"
  | "ucreate" | "uedit" | "uclose" | "uopen" | "parent" | "child"
  | "extend" | "merge" | "mgrextend" | "mgrmerge"
  | "edit" | "cancel";

export const CATS: Record<EventCat, { label: string; hue: number; chroma: number }> = {
  member: { label: "สมาชิก", hue: 150, chroma: 0.13 },
  mgr: { label: "หัวหน้า", hue: 70, chroma: 0.15 },
  primary: { label: "ห้องหลัก", hue: 264, chroma: 0.15 },
  unit: { label: "ห้อง", hue: 300, chroma: 0.12 },
  fix: { label: "แก้ไข / ยกเลิก", hue: 286, chroma: 0 },
};

export const EVENT_TYPES: Record<EventType, { label: string; cat: EventCat }> = {
  in: { label: "เข้าห้อง", cat: "member" },
  future: { label: "จะเข้าห้อง (ล่วงหน้า)", cat: "member" },
  movein: { label: "ย้ายเข้ามา", cat: "member" },
  moveout: { label: "ย้ายออกไปห้องอื่น", cat: "member" },
  out: { label: "ออกจากห้อง", cat: "member" },
  position: { label: "เปลี่ยนตำแหน่ง", cat: "member" },
  extend: { label: "ขยายช่วงวันที่ (ต่อกับรายการเดิม)", cat: "member" },
  merge: { label: "รวมรายการที่ต่อกัน", cat: "member" },
  mgr: { label: "ตั้งเป็นหัวหน้า", cat: "mgr" },
  unmgr: { label: "ถอดหัวหน้า / พ้นหัวหน้า", cat: "mgr" },
  mgrextend: { label: "ขยายช่วงหัวหน้า (ต่อกับรายการเดิม)", cat: "mgr" },
  mgrmerge: { label: "รวมช่วงหัวหน้าที่ต่อกัน", cat: "mgr" },
  primary: { label: "ตั้งเป็นห้องหลัก", cat: "primary" },
  unprimary: { label: "ห้องหลักย้ายไปห้องอื่น", cat: "primary" },
  ucreate: { label: "สร้างห้อง", cat: "unit" },
  uedit: { label: "แก้ไขข้อมูลห้อง", cat: "unit" },
  uclose: { label: "ปิดห้อง", cat: "unit" },
  uopen: { label: "เปิดห้องกลับ", cat: "unit" },
  parent: { label: "เปลี่ยนห้องแม่", cat: "unit" },
  child: { label: "เพิ่มห้องลูก", cat: "unit" },
  edit: { label: "แก้ไขข้อมูล (กรอกผิด)", cat: "fix" },
  cancel: { label: "ยกเลิกรายการ", cat: "fix" },
};

/** สีของเหตุการณ์ = สีของกลุ่ม (ตรงกับจุดสีบนปุ่มกรองกลุ่ม) */
export const catTone = (k: EventCat) => hueTone(CATS[k].hue, CATS[k].chroma);
export const eventTone = (t: EventType) => catTone(EVENT_TYPES[t].cat);

export type Diff = { field: string; old: string; new: string };

export type UnitEvent = {
  key: string;
  date: string; // วันที่มีผล (เหตุการณ์จาก log = วันที่บันทึก)
  type: EventType;
  name: string;
  sub: string;
  by: string | null;
  at: string | null; // yyyy-mm-dd hh:mi
  diffs: Diff[];
  struck?: boolean;
};

type Ctx = { unitId: number; units: OrgUnitRow[]; lookups: OrgLookups; today: string };

/** เหตุการณ์ทั้งหมดของห้อง เรียงใหม่ -> เก่า */
export function buildEvents(rows: OrgMemberHistRow[], log: OrgLogRow[], ctx: Ctx): UnitEvent[] {
  // ค่า is_manager ตอนสร้างแถว = ค่าเดิมของการสลับหัวหน้าครั้งแรกใน log (log เรียงใหม่ -> เก่า: ตัวท้ายสุดชนะ)
  const createdMgr = new Map<number, boolean>();
  for (const l of log) {
    if (l.table_name !== "Org_Member") continue;
    const o = parse(l.old_json);
    if (isMgrFlip(o, parse(l.new_json))) createdMgr.set(l.row_id, Boolean(o!.is_manager));
  }
  return [...memberEvents(rows, ctx.today, createdMgr), ...logEvents(rows, log, ctx)].sort(
    (a, b) => b.date.localeCompare(a.date) || (b.at ?? "").localeCompare(a.at ?? ""),
  );
}

function memberEvents(rows: OrgMemberHistRow[], today: string, createdMgr: Map<number, boolean>): UnitEvent[] {
  const ev: UnitEvent[] = [];
  const byUser = new Map<number, OrgMemberHistRow[]>();
  for (const r of rows) {
    if (!r.Actived || !r.start_date) continue;
    (byUser.get(r.UserID) ?? byUser.set(r.UserID, []).get(r.UserID)!).push(r);
  }

  for (const list of byUser.values()) {
    list.sort((a, b) => a.start_date!.localeCompare(b.start_date!));
    // แบ่งเป็นสาย: แถวที่ต่อกันพอดี = อยู่ห้องเดิมต่อเนื่อง (ถูกแบ่งเพราะเปลี่ยนหัวหน้า / ห้องหลัก)
    const chains: OrgMemberHistRow[][] = [];
    for (const r of list) {
      const last = chains.at(-1)?.at(-1);
      if (last?.end_date && addDays(last.end_date, 1) === r.start_date) chains.at(-1)!.push(r);
      else chains.push([r]);
    }

    for (const chain of chains) {
      const first = chain[0];
      const last = chain.at(-1)!;
      const who = first.Name ?? first.UserCode;
      const base = (r: OrgMemberHistRow, date: string, type: EventType, sub: string, at: "create" | "update" = "create"): UnitEvent => ({
        key: `${type}-${r.Member_ID}-${date}`, date, type, name: who, sub,
        by: at === "create" ? r.CreateBy : r.UpdateBy ?? r.CreateBy,
        at: at === "create" ? r.CreateDate : r.UpdateDate ?? r.CreateDate,
        diffs: [],
      });
      const roomKind = (r: OrgMemberHistRow) => (r.is_primary ? "ห้องหลัก" : "ห้องรอง");

      // เข้า
      const s = first.start_date!;
      if (first.prev_unit) ev.push(base(first, s, "movein", `${first.UserCode} · มาจาก ${first.prev_unit} · ${posLabel(first)}`));
      else ev.push(base(first, s, s > today ? "future" : "in", `${first.UserCode} · ${posLabel(first)} · ${roomKind(first)}`));
      // ใช้ค่าตอนสร้างแถว — ถ้าถูกสลับหัวหน้าทับแถวเดิมภายหลัง เหตุการณ์นั้นมาจาก log
      if (createdMgr.get(first.Member_ID) ?? first.is_manager) ev.push(base(first, s, "mgr", `${first.UserCode} · ${posLabel(first)}`));

      // เปลี่ยนระหว่างทาง
      for (let i = 1; i < chain.length; i++) {
        const a = chain[i - 1];
        const b = chain[i];
        const d = b.start_date!;
        if (a.is_manager !== b.is_manager)
          ev.push(base(b, d, b.is_manager ? "mgr" : "unmgr", b.is_manager ? `${b.UserCode} · ${posLabel(b)}` : `${b.UserCode} · ยังอยู่ในห้องต่อ`));
        if (a.is_primary !== b.is_primary)
          ev.push(base(b, d, b.is_primary ? "primary" : "unprimary", `${b.UserCode} · ${b.is_primary ? "ห้องนี้เป็นห้องหลัก" : "ห้องนี้กลายเป็นห้องรอง"}`));
        if (a.PositionID !== b.PositionID)
          ev.push({ ...base(b, d, "position", b.UserCode), diffs: [{ field: "ตำแหน่ง", old: posLabel(a), new: posLabel(b) }] });
      }

      // ออก
      const e = last.end_date;
      if (e) {
        const stay = duration(s, e, today);
        if (last.next_unit) {
          ev.push(base(last, addDays(e, 1), "moveout", `${last.UserCode} · ไป ${last.next_unit} · อยู่ ${stay}`, "update"));
        } else {
          ev.push(base(last, e, "out", `${last.UserCode} · วันสุดท้ายในห้อง · อยู่ ${stay}`, "update"));
        }
        if (last.is_manager)
          ev.push(base(last, addDays(e, 1), "unmgr", `${last.UserCode} · พ้นหัวหน้าเพราะ${last.next_unit ? "ย้ายห้อง" : "ออกจากห้อง"}`, "update"));
      }
    }
  }
  return ev;
}

type Json = Record<string, unknown>;
const parse = (s: string | null): Json | null => {
  if (!s) return null;
  try {
    return JSON.parse(s) as Json;
  } catch {
    return null;
  }
};
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/**
 * สลับหัวหน้าแบบแก้ทับแถวเดิม (แถวเริ่มวันเดียวกับวันที่มีผล แบ่งแถวไม่ได้) — ช่วงวันที่ไม่เปลี่ยน
 * จึงไม่เห็นจากแถว Org_Member ต้องอ่านจาก log (กรณีแบ่งแถว ดูจากช่วงวันที่ได้อยู่แล้ว)
 */
const isMgrFlip = (o: Json | null, n: Json | null) =>
  Boolean(o && n && o.Actived && n.Actived && str(o.Unit_ID) === str(n.Unit_ID)
    && Boolean(o.is_manager) !== Boolean(n.is_manager)
    && str(o.start_date) === str(n.start_date) && str(o.end_date) === str(n.end_date));
const dateVal = (v: unknown) => fmt(str(v).slice(0, 10) || null) || "-";

function logEvents(rows: OrgMemberHistRow[], log: OrgLogRow[], { unitId, units, lookups }: Ctx): UnitEvent[] {
  const ev: UnitEvent[] = [];
  const memberById = new Map(rows.map((r) => [r.Member_ID, r]));
  const unitCode = (id: unknown) => {
    if (id === null || id === undefined) return "-";
    const u = units.find((x) => x.Unit_ID === Number(id));
    return u ? u.unit_code : `#${str(id)}`;
  };
  const optLabel = (opts: { value: string; label: string }[], id: unknown) =>
    id === null || id === undefined ? "-" : opts.find((o) => o.value === str(id))?.label ?? `#${str(id)}`;
  const typeName = (t: unknown) => lookups.unitTypes.find((x) => x.unit_type === t)?.name_th ?? (str(t) || "-");

  // log ของ Org_Member ที่บันทึกใน transaction เดียวกัน (Log_ID ติดกัน) ของคนเดียวกันในห้องเดียวกัน
  const memberLogs = log
    .filter((l) => l.table_name === "Org_Member" && l.action === "U")
    .map((l) => ({ l, o: parse(l.old_json), n: parse(l.new_json) }));
  const sibling = (l: OrgLogRow, o: Json, pred: (o2: Json, n2: Json) => boolean) =>
    memberLogs.find(
      (x) => x.l.row_id !== l.row_id && Math.abs(x.l.Log_ID - l.Log_ID) <= 3 && x.o && x.n
        && str(x.n.UserID) === str(o.UserID) && str(x.n.Unit_ID) === str(o.Unit_ID) && pred(x.o, x.n),
    );
  const day = (v: unknown) => str(v).slice(0, 10) || null;
  /** ช่วงของ a คลุมช่วงของ b ทั้งหมด (null = ไม่มีขอบ) */
  const covers = (a: Json, b: Json) => {
    const as = day(a.start_date), ae = day(a.end_date), bs = day(b.start_date), be = day(b.end_date);
    return (!as || (Boolean(bs) && as <= bs!)) && (!ae || (Boolean(be) && ae >= be!));
  };

  for (const l of log) {
    const o = parse(l.old_json);
    const n = parse(l.new_json);
    const date = l.ChangeDate.slice(0, 10);
    const meta = { by: l.ChangeBy, at: l.ChangeDate };

    if (l.table_name === "Org_Unit") {
      if (l.action === "I" && n) {
        const label = `${str(n.unit_code)}${n.unit_name ? ` ${str(n.unit_name)}` : ""}`;
        // log การสร้างห้องลูก (parent_unit_id = ห้องนี้) ถูกดึงมาด้วย — แยกด้วย row_id
        ev.push({
          key: `log${l.Log_ID}`, date, ...meta, diffs: [],
          ...(l.row_id === unitId
            ? { type: "ucreate" as const, name: label, sub: `${typeName(n.unit_type)} · ใต้ ${unitCode(n.parent_unit_id)}` }
            : { type: "child" as const, name: label, sub: `สร้างห้องลูกประเภท ${typeName(n.unit_type)}` }),
        });
        continue;
      }
      if (l.action !== "U" || !o || !n) continue;
      const name = `${str(n.unit_code)}`;
      if (o.Actived && !n.Actived) {
        ev.push({ key: `log${l.Log_ID}`, date, type: "uclose", name, sub: "ปิดห้อง (Actived = 0)", ...meta, diffs: [] });
        continue;
      }
      if (!o.Actived && n.Actived) {
        ev.push({ key: `log${l.Log_ID}`, date, type: "uopen", name, sub: "เปิดห้องกลับ (Actived = 1)", ...meta, diffs: [] });
        continue;
      }
      if (str(o.parent_unit_id) !== str(n.parent_unit_id)) {
        ev.push({
          key: `log${l.Log_ID}p`, date, type: "parent", name, sub: "ย้ายทั้งห้องพร้อมห้องลูก", ...meta,
          diffs: [{ field: "ห้องแม่", old: unitCode(o.parent_unit_id), new: unitCode(n.parent_unit_id) }],
        });
      }
      const diffs: Diff[] = [];
      const cmp = (k: string, field: string, show: (v: unknown) => string = str) => {
        if (str(o[k]) !== str(n[k])) diffs.push({ field, old: show(o[k]) || "-", new: show(n[k]) || "-" });
      };
      cmp("unit_code", "รหัสห้อง");
      cmp("unit_name", "ชื่อห้อง");
      cmp("unit_type", "ประเภท", typeName);
      if (diffs.length) ev.push({ key: `log${l.Log_ID}`, date, type: "uedit", name, sub: "", ...meta, diffs });
      continue;
    }

    // Org_Member (U เท่านั้น — เข้า/ออก/ย้าย ดูจากช่วงวันที่ของแถวแล้ว)
    if (!o || !n) continue;
    const r = memberById.get(l.row_id);
    const who = r ? r.Name ?? r.UserCode : `Member #${l.row_id}`;
    const code = r?.UserCode ?? "";
    if (o.Actived && !n.Actived) {
      // รวมแถว: แถวนี้ถูกปิด + อีกแถวของคนเดียวกันขยายช่วงมาคลุมช่วงของแถวนี้ (เดิมไม่คลุม)
      const into = sibling(l, o, (o2, n2) => Boolean(n2.Actived) && covers(n2, o) && !covers(o2, o));
      if (into) {
        ev.push({
          key: `log${l.Log_ID}`, date, type: into.n!.is_manager ? "mgrmerge" : "merge", name: who, ...meta,
          sub: `${code} · รวมเป็นรายการเดียว ${fmtRange(day(into.n!.start_date), day(into.n!.end_date))}`,
          diffs: [{ field: "วันที่จบ", old: dateVal(into.o!.end_date), new: dateVal(into.n!.end_date) }],
        });
        continue;
      }
      ev.push({
        key: `log${l.Log_ID}`, date, type: "cancel", name: who, struck: true, ...meta, diffs: [],
        sub: `${code} · ${r ? posLabel(r) : ""} · ${fmtRange(str(o.start_date).slice(0, 10) || null, str(o.end_date).slice(0, 10) || null)}`,
      });
      continue;
    }
    // แก้ทับแถวเดิม (แก้ข้อมูลกรอกผิด): ตำแหน่ง / วันที่เริ่ม เปลี่ยน ในห้องเดิม
    // (end_date อย่างเดียว = ให้ออก / แบ่งช่วง — แสดงจากช่วงวันที่แล้ว)
    if (!o.Actived || !n.Actived || str(o.Unit_ID) !== str(n.Unit_ID)) continue;
    if (isMgrFlip(o, n)) {
      const on = Boolean(n.is_manager);
      ev.push({
        key: `log${l.Log_ID}m`, date: str(n.start_date).slice(0, 10) || date, type: on ? "mgr" : "unmgr", name: who, ...meta, diffs: [],
        sub: on ? `${code} · ${r ? posLabel(r) : ""}` : `${code} · ยังอยู่ในห้องต่อ`,
      });
    }
    if (str(o.PositionID) === str(n.PositionID) && str(o.start_date) === str(n.start_date)) {
      // ขยายวันจบให้ยาวขึ้นอย่างเดียว = ต่อช่วงเข้ากับรายการเดิม (หดวันจบ = ให้ออก / แบ่งช่วง — แสดงจากช่วงวันที่แล้ว)
      const oe = day(o.end_date);
      const ne = day(n.end_date);
      const longer = Boolean(oe) && (!ne || ne > oe!) && Boolean(o.is_manager) === Boolean(n.is_manager);
      // รวมแถว: แสดงที่เหตุการณ์ "รวม" ของแถวที่ถูกปิดแล้ว
      const merged = longer && sibling(l, o, (o2, n2) => Boolean(o2.Actived) && !n2.Actived && covers(n, o2));
      if (longer && !merged)
        ev.push({
          key: `log${l.Log_ID}`, date, type: n.is_manager ? "mgrextend" : "extend", name: who, ...meta,
          sub: `${code} · ${r ? posLabel(r) : ""} · ${fmtRange(day(n.start_date), ne)}`,
          diffs: [{ field: "วันที่จบ", old: dateVal(o.end_date), new: dateVal(n.end_date) }],
        });
      continue;
    }
    // เลื่อนวันเริ่มให้เร็วขึ้นอย่างเดียว (ตำแหน่ง / หัวหน้า / วันจบเดิม) = ต่อช่วงเข้ากับรายการเดิม ไม่ใช่แก้ข้อมูลกรอกผิด
    const os = day(o.start_date);
    const ns = day(n.start_date);
    if (
      os && ns && ns < os && str(o.PositionID) === str(n.PositionID)
      && Boolean(o.is_manager) === Boolean(n.is_manager) && day(o.end_date) === day(n.end_date)
    ) {
      ev.push({
        key: `log${l.Log_ID}`, date, type: n.is_manager ? "mgrextend" : "extend", name: who, ...meta,
        sub: `${code} · ${r ? posLabel(r) : ""} · ${fmtRange(ns, day(n.end_date))}`,
        diffs: [{ field: "วันที่เริ่ม", old: dateVal(o.start_date), new: dateVal(n.start_date) }],
      });
      continue;
    }
    // เลื่อนวันเริ่มให้ช้าลงอย่างเดียว เพราะอีกแถวขยายวันจบมาต่อพอดี (ตั้ง/ถอดหัวหน้าต่อจากช่วงเดิม)
    // — แสดงที่เหตุการณ์ "ขยายช่วง" ของอีกแถวแล้ว
    if (
      os && ns && ns > os && str(o.PositionID) === str(n.PositionID)
      && Boolean(o.is_manager) === Boolean(n.is_manager) && day(o.end_date) === day(n.end_date)
      && sibling(l, o, (o2, n2) => day(n2.end_date) === addDays(ns, -1) && day(o2.end_date) !== day(n2.end_date))
    )
      continue;
    const diffs: Diff[] = [];
    if (str(o.PositionID) !== str(n.PositionID))
      diffs.push({ field: "ตำแหน่ง", old: optLabel(lookups.positions, o.PositionID), new: optLabel(lookups.positions, n.PositionID) });
    if (str(o.start_date) !== str(n.start_date)) diffs.push({ field: "วันที่เริ่ม", old: dateVal(o.start_date), new: dateVal(n.start_date) });
    if (str(o.end_date) !== str(n.end_date)) diffs.push({ field: "วันที่จบ", old: dateVal(o.end_date), new: dateVal(n.end_date) });
    ev.push({ key: `log${l.Log_ID}`, date, type: "edit", name: who, sub: `${code} · แก้ทับแถวเดิม`, ...meta, diffs });
  }
  return ev;
}
