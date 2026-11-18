"use client";

import { useEffect, useMemo, useState } from "react";
import { Info, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/cbo-liveserch";
import { AppAlert } from "@/components/common/app-alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { OrgLookups, OrgMemberRow, OrgUnitRow, UserUnitRow } from "@/lib/org/types";
import { useOrgApi } from "./api";
import { fmtDate, todayStr, unitLabel, useRunAction } from "./shared";
import { Field } from "./unit-dialogs";

/** date = วันที่มีผลตั้งต้น (ว่าง = วันนี้) · until = "ถึงวันที่" ตั้งต้นของการตั้งหัวหน้า */
type Defaults = { date?: string; until?: string | null };

export type MemberAction = Defaults & (
  | { kind: "add"; unit: OrgUnitRow }
  | { kind: "move" | "primary" | "manager" | "end" | "edit" | "cancel"; unit: OrgUnitRow; member: OrgMemberRow }
  /**
   * ตั้งหัวหน้าในช่วงหัวหน้าหนึ่งช่วงบนปฏิทิน [start, end] (end null = ถึงปัจจุบัน)
   * vacant = ช่วงว่าง / ไม่ใช่ = ตั้งแทนหัวหน้าเดิม · memberId = คนที่ลากมาวาง (เลือกไว้ให้)
   */
  | { kind: "assign"; unit: OrgUnitRow; start: string; end: string | null; vacant: boolean; memberId?: number }
);

type Range = { start_date: string | null; end_date: string | null };

/** ช่วงตั้งต้นเมื่อเลือกคน = ช่วงบนปฏิทินที่ตัดให้อยู่ในช่วงที่คนนั้นอยู่ห้อง */
const clampTo = (start: string, end: string | null, r: Range) => ({
  date: r.start_date && r.start_date > start ? r.start_date : start,
  until: [end, r.end_date].filter((e): e is string => Boolean(e)).sort()[0] ?? "",
});

/** ช่วง [a1, a2] กับ [b1, b2] ทับกันไหม (null = ไม่มีขอบ) */
const overlaps = (a1: string | null, a2: string | null, b1: string | null, b2: string | null) =>
  (!a1 || !b2 || a1 <= b2) && (!b1 || !a2 || b1 <= a2);

const TITLES: Record<MemberAction["kind"], string> = {
  assign: "ตั้งหัวหน้า",
  add: "เพิ่มคนเข้าห้อง",
  move: "ย้ายห้อง",
  primary: "ตั้งเป็นห้องหลัก",
  manager: "หัวหน้าห้อง",
  end: "ให้ออกจากห้อง",
  edit: "แก้ไขข้อมูล",
  cancel: "ยกเลิกรายการ",
};

export function MemberActionDialog({ action, units, lookups, members, onClose, onDone }: {
  action: MemberAction | null;
  units: OrgUnitRow[];
  lookups: OrgLookups;
  members: OrgMemberRow[];
  onClose: () => void;
  onDone: (u: OrgUnitRow[]) => void;
}) {
  const key = action
    ? `${action.kind}-${"member" in action ? action.member.Member_ID : action.unit.Unit_ID}-${action.kind === "assign" ? action.start : action.date ?? ""}`
    : "none";
  return (
    <Dialog open={Boolean(action)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {action && (
          <ActionForm key={key} action={action} units={units} lookups={lookups} members={members} onClose={onClose} onDone={onDone} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ActionForm({ action, units, lookups, members, onClose, onDone }: {
  action: MemberAction;
  units: OrgUnitRow[];
  lookups: OrgLookups;
  members: OrgMemberRow[];
  onClose: () => void;
  onDone: (u: OrgUnitRow[]) => void;
}) {
  const gap = action.kind === "assign" ? action : null;
  const unit = action.unit;
  const { run, pending } = useRunAction(onDone);
  const {
    addMember, cancelMember, editMember, endMember, loadUserUnits, moveMember, replaceManager, setManager, setPrimary,
  } = useOrgApi();

  // ตั้งหัวหน้าตามช่วง: คนที่อยู่ห้องในช่วงนั้น (ยังไม่เป็นหัวหน้า)
  const gapRows = useMemo(
    () => (gap ? members.filter((x) => !x.is_manager && overlaps(x.start_date, x.end_date, gap.start, gap.end)) : []),
    [gap, members],
  );
  // ลากมาวาง -> เลือกคนนั้นไว้ให้ และตัดช่วงตั้งต้นให้อยู่ในช่วงของแถวนั้น
  const initPick = gap?.memberId != null ? gapRows.find((x) => x.Member_ID === gap.memberId) : undefined;
  // ส่งวันที่ตั้งต้นมา (ลากวางบนวันที่เลือก) -> ใช้วันนั้นเป็นทั้งวันเริ่มและวันจบ
  const init = gap
    ? action.date
      ? { date: action.date, until: action.until ?? action.date }
      : initPick ? clampTo(gap.start, gap.end, initPick) : { date: gap.start, until: gap.end ?? "" }
    : null;

  const [date, setDate] = useState(init?.date ?? action.date ?? todayStr());
  const [until, setUntil] = useState(init?.until ?? action.until ?? "");
  const [pickId, setPickId] = useState(initPick ? String(initPick.Member_ID) : "");
  const [userId, setUserId] = useState("");
  const [isManager, setIsManager] = useState(false);
  const [toUnitId, setToUnitId] = useState("");
  const [userUnits, setUserUnits] = useState<UserUnitRow[] | null>(null);

  const picked = gapRows.find((x) => String(x.Member_ID) === pickId) ?? null;
  const pick = (id: string) => {
    setPickId(id);
    const r = gapRows.find((x) => String(x.Member_ID) === id);
    if (!gap || !r) return;
    const c = clampTo(gap.start, gap.end, r);
    setDate(c.date);
    setUntil(c.until);
  };

  const m = "member" in action ? action.member : picked;
  const [positionId, setPositionId] = useState(m ? String(m.PositionID) : "");
  const [startDate, setStartDate] = useState(m?.start_date ?? "");
  const [endDate, setEndDate] = useState(action.kind === "edit" ? (m?.end_date ?? "") : "");

  // เพิ่มคน: เลือกคนแล้วโหลดห้องอื่นที่คนนี้อยู่ เพื่อเตือนก่อนเพิ่มซ้ำ
  useEffect(() => {
    if (action.kind !== "add" || !userId) return;
    let alive = true;
    loadUserUnits(Number(userId))
      .then((r) => alive && setUserUnits(r.ok ? r.data : []))
      .catch(() => alive && setUserUnits([]));
    return () => {
      alive = false;
    };
  }, [action.kind, userId, loadUserUnits]);

  const unitOptions = useMemo(
    () => units.filter((u) => u.Unit_ID !== unit.Unit_ID).map((u) => ({ value: String(u.Unit_ID), label: unitLabel(u) })),
    [units, unit.Unit_ID],
  );

  // ช่วงที่จะเป็นหัวหน้า: ตั้งหัวหน้า = [date, until หรือวันจบของแถว] · เพิ่มคน = [date, วันที่จบ]
  const rangeEnd =
    action.kind === "manager" || action.kind === "assign" ? (until || m?.end_date || null)
      : action.kind === "add" ? (endDate || null)
        : date;
  // หัวหน้าคนอื่นของห้องนี้ที่ทับช่วงนั้น — ตั้งหัวหน้า: จะถูกถอดเฉพาะส่วนที่ทับ · เพิ่มคน: trigger จะ error
  const overlapMgrs = date
    ? members.filter((x) => x.is_manager && x.Member_ID !== m?.Member_ID && overlaps(x.start_date, x.end_date, date, rangeEnd))
    : [];
  const otherManager = overlapMgrs[0];
  const targetUnit = toUnitId ? units.find((u) => u.Unit_ID === Number(toUnitId)) : undefined;
  // อยู่ห้องนี้ "ซ้อนช่วงวันที่" ที่จะเพิ่ม -> เพิ่มไม่ได้ (ช่วงที่ไม่ทับ / ต่อกันพอดี เพิ่มได้ — server ต่อแถวเดิมให้)
  const alreadyInUnit =
    action.kind === "add" &&
    Boolean(date) &&
    userUnits?.some(
      (u) =>
        u.Unit_ID === unit.Unit_ID &&
        (!u.start_date || !endDate || u.start_date <= endDate) &&
        (!u.end_date || u.end_date >= date),
    );

  // ตำแหน่งที่เลือกได้ = ตำแหน่งกลาง + ของบริษัทห้องปลายทาง (ย้าย) / ห้องนี้ (อื่น ๆ) — trigger ตรวจซ้ำฝั่ง DB
  const posComId = action.kind === "move" ? (targetUnit?.ComID ?? unit.ComID) : unit.ComID;
  const positionOptions = useMemo(
    () => lookups.positions.filter((p) => p.comId == null || p.comId === posComId),
    [lookups.positions, posComId],
  );
  const positionMismatch = Boolean(positionId) && !positionOptions.some((p) => p.value === positionId);

  const who = m ? `${m.Name ?? ""} (${m.UserCode})` : "";
  const managerOn = action.kind === "assign" || (action.kind === "manager" && m ? !m.is_manager : false);

  const submit = async () => {
    const by = undefined;
    let ok = false;
    switch (action.kind) {
      case "add":
        ok = await run(
          addMember({
            unitId: unit.Unit_ID, userId: Number(userId), positionId: Number(positionId), isManager, date, endDate: endDate || null, by,
          }),
          "เพิ่มคนเข้าห้องเรียบร้อยแล้ว",
        );
        break;
      case "assign":
        ok = await run(
          replaceManager({ memberId: Number(pickId), date, until: until || null, by }),
          overlapMgrs.length ? "ตั้งหัวหน้าแทนเรียบร้อยแล้ว" : "ตั้งหัวหน้าเรียบร้อยแล้ว",
        );
        break;
      case "move":
        ok = await run(
          moveMember({ memberId: m!.Member_ID, toUnitId: Number(toUnitId), positionId: Number(positionId) || null, isManager, date, by }),
          `ย้ายไป ${targetUnit?.unit_code ?? ""} เรียบร้อยแล้ว`,
        );
        break;
      case "primary":
        ok = await run(setPrimary({ memberId: m!.Member_ID, date, by }), "ตั้งห้องหลักเรียบร้อยแล้ว");
        break;
      case "manager":
        ok = await run(
          managerOn
            ? replaceManager({ memberId: m!.Member_ID, date, until: until || null, by })
            : setManager({ memberId: m!.Member_ID, isManager: false, date, until: until || null, by }),
          managerOn ? "ตั้งหัวหน้าเรียบร้อยแล้ว" : "ถอดหัวหน้าเรียบร้อยแล้ว",
        );
        break;
      case "end":
        ok = await run(endMember({ memberId: m!.Member_ID, date, by }), "บันทึกการออกจากห้องเรียบร้อยแล้ว");
        break;
      case "edit":
        ok = await run(
          editMember({ memberId: m!.Member_ID, positionId: Number(positionId), startDate: startDate || null, endDate: endDate || null, by }),
          "แก้ไขข้อมูลเรียบร้อยแล้ว",
        );
        break;
      case "cancel":
        ok = await run(cancelMember({ memberId: m!.Member_ID, by }), "ยกเลิกรายการแล้ว");
        break;
    }
    if (ok) onClose();
  };

  const untilBad = Boolean(until && date && until < date) || Boolean(until && m?.end_date && until > m.end_date);
  const dateOutOfRow = Boolean(m && date && ((m.start_date && date < m.start_date) || (m.end_date && date > m.end_date)));
  const invalid =
    (action.kind === "add" && (!userId || !positionId || alreadyInUnit || Boolean(endDate && endDate < date))) ||
    (action.kind === "assign" && (!picked || untilBad || dateOutOfRow)) ||
    (action.kind === "manager" && (untilBad || dateOutOfRow)) ||
    (action.kind === "move" && (!toUnitId || positionMismatch)) ||
    (action.kind === "edit" && (!positionId || Boolean(startDate && endDate && endDate < startDate))) ||
    (action.kind !== "edit" && action.kind !== "cancel" && !date);

  const dateField = (label: string, hint?: string) => (
    <Field label={label}>
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </Field>
  );

  // วันที่มีผล + ถึงวันที่ ของการตั้ง / ถอดหัวหน้า
  const managerRange = (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Field label="ตั้งแต่วันที่ *">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="ถึงวันที่">
          <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
        </Field>
      </div>
      <span className="text-[11px] text-muted-foreground">
        {m ? `คนนี้อยู่ห้องนี้ ${fmtDate(m.start_date) || "ไม่ระบุ"} – ${fmtDate(m.end_date) || "ปัจจุบัน"} · ` : ""}
        ว่าง &quot;ถึงวันที่&quot; = ตลอดช่วงที่อยู่ห้อง · กรอก = หลังวันนั้นกลับเป็นสถานะเดิม (ระบบแบ่งแถวให้เอง)
      </span>
      {dateOutOfRow && <span className="text-xs text-destructive">วันที่มีผลต้องอยู่ในช่วงที่คนนี้อยู่ห้อง</span>}
      {untilBad && (
        <span className="text-xs text-destructive">
          {until < date ? "\"ถึงวันที่\" ต้องไม่ก่อนวันที่มีผล" : "\"ถึงวันที่\" เกินช่วงที่คนนี้อยู่ห้อง"}
        </span>
      )}
      {managerOn && !untilBad && !dateOutOfRow && overlapMgrs.length > 0 && (
        <ReplaceWarn rows={overlapMgrs} from={date} to={rangeEnd} />
      )}
    </>
  );

  const managerCheckbox = (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="size-4 accent-primary" checked={isManager} onChange={(e) => setIsManager(e.target.checked)} />
      เป็นหัวหน้าห้อง{action.kind === "move" ? "ปลายทาง" : "นี้"}
    </label>
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {action.kind === "manager" ? (managerOn ? "ตั้งเป็นหัวหน้าห้อง" : "ถอดหัวหน้าห้อง") : TITLES[action.kind]}
        </DialogTitle>
        <DialogDescription>
          {who ? `${who} · ` : ""}
          {unit.unit_code}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-3">
        {action.kind === "add" && (
          <>
            <Field label="พนักงาน *">
              <Combobox
                options={lookups.users}
                value={userId}
                onValueChange={(v) => {
                  setUserId(v);
                  setUserUnits(null);
                }}
                placeholder="เลือกพนักงาน"
                searchPlaceholder="ค้นหาชื่อหรือรหัสพนักงาน"
              />
            </Field>
            {userId && userUnits === null && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> กำลังตรวจห้องอื่นของคนนี้...
              </span>
            )}
            {userUnits && userUnits.length > 0 && (
              <AppAlert
                tone={alreadyInUnit ? "destructive" : "info"}
                icon={<Info />}
                title={alreadyInUnit ? "คนนี้อยู่ห้องนี้ในช่วงวันที่นี้แล้ว" : `คนนี้มีห้องอยู่ ${userUnits.length} รายการ`}
                description={userUnits
                  .map(
                    (u) =>
                      `${u.ComCode}·${u.unit_code} [${u.start_date ?? "…"} – ${u.end_date ?? "ปัจจุบัน"}]` +
                      `${u.is_primary ? " (ห้องหลัก)" : ""}${u.is_manager ? " (หัวหน้า)" : ""}`,
                  )
                  .join(", ")}
              />
            )}
            {userUnits && userUnits.length === 0 && (
              <span className="text-xs text-muted-foreground">ยังไม่มีห้องอื่น — ห้องนี้จะเป็นห้องหลักให้อัตโนมัติ</span>
            )}
            <Field label="ตำแหน่ง *">
              <Combobox options={positionOptions} value={positionId} onValueChange={setPositionId} placeholder="เลือกตำแหน่ง" />
            </Field>
            {managerCheckbox}
            {isManager && otherManager && <ManagerTaken m={otherManager} />}
            <div className="grid grid-cols-2 gap-2">
              <Field label="วันที่เริ่ม *">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="วันที่จบ (ว่าง = ปัจจุบัน)">
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </Field>
            </div>
            {endDate && endDate < date && <span className="text-xs text-destructive">วันที่จบต้องไม่ก่อนวันที่เริ่ม</span>}
          </>
        )}

        {gap && (
          <>
            <AppAlert
              tone="info"
              icon={<Info />}
              description={`${gap.vacant ? "ห้องว่างหัวหน้า" : "ช่วงหัวหน้าเดิม"} ${fmtDate(gap.start)} – ${fmtDate(gap.end) || "ปัจจุบัน"} · เลือกคนที่อยู่ห้องในช่วงนั้น`}
            />
            <Field label="หัวหน้า *">
              <Combobox
                options={gapRows.map((x) => ({
                  value: String(x.Member_ID),
                  label: `${x.Name ?? ""} (${x.UserCode}) · ${fmtDate(x.start_date) || "ไม่ระบุ"} – ${fmtDate(x.end_date) || "ปัจจุบัน"}`,
                }))}
                value={pickId}
                onValueChange={pick}
                placeholder={gapRows.length ? "เลือกคน" : "ช่วงนี้ไม่มีคนในห้อง"}
                searchPlaceholder="ค้นหาชื่อหรือรหัสพนักงาน"
              />
            </Field>
            {picked && managerRange}
          </>
        )}

        {action.kind === "move" && (
          <>
            <Field label="ห้องปลายทาง *">
              <Combobox options={unitOptions} value={toUnitId} onValueChange={setToUnitId} placeholder="เลือกห้อง" searchPlaceholder="ค้นหารหัส / ชื่อห้อง" />
            </Field>
            <Field label="ตำแหน่งในห้องใหม่">
              <Combobox options={positionOptions} value={positionId} onValueChange={setPositionId} placeholder="ตำแหน่งเดิม" />
            </Field>
            {positionMismatch && <Warn text="ตำแหน่งเดิมเป็นของบริษัทอื่น ใช้กับห้องปลายทางไม่ได้ — เลือกตำแหน่งใหม่" />}
            {managerCheckbox}
            {dateField("วันที่มีผล", "แถวเดิมจะจบก่อนวันนี้ 1 วัน · สถานะห้องหลักติดไปกับห้องใหม่")}
            {m?.is_manager && <Warn text={`ห้อง ${unit.unit_code} จะไม่มีหัวหน้าตั้งแต่วันที่มีผล`} />}
          </>
        )}

        {action.kind === "primary" && (
          <>
            {dateField("วันที่มีผล", "ห้องหลักเดิมจะถูกแบ่งช่วงวันที่ให้อัตโนมัติ (usp_Org_SetPrimary)")}
          </>
        )}

        {action.kind === "manager" && (
          <>
            {!managerOn && <Warn text={`ห้อง ${unit.unit_code} จะไม่มีหัวหน้าในช่วงนี้ — สายอนุมัติจะขึ้นไปห้องแม่`} />}
            {managerRange}
          </>
        )}

        {action.kind === "end" && (
          <>
            {dateField("วันสุดท้ายที่อยู่ห้องนี้")}
            {m?.is_primary && <Warn text="ห้องนี้เป็นห้องหลักของคนนี้ — หลังวันนี้คนนี้จะไม่มีห้องหลัก ควรตั้งห้องหลักใหม่" />}
            {m?.is_manager && <Warn text={`คนนี้เป็นหัวหน้า — ห้อง ${unit.unit_code} จะไม่มีหัวหน้าหลังวันนี้`} />}
          </>
        )}

        {action.kind === "edit" && (
          <>
            <AppAlert tone="info" icon={<Info />} description="ใช้แก้ข้อมูลที่กรอกผิดเท่านั้น — แก้ทับแถวเดิมโดยไม่เก็บช่วงวันที่เดิมไว้ (ดูย้อนหลังได้ใน Org_ChangeLog)" />
            <Field label="ตำแหน่ง *">
              <Combobox options={positionOptions} value={positionId} onValueChange={setPositionId} placeholder="เลือกตำแหน่ง" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="วันที่เริ่ม">
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </Field>
              <Field label="วันที่จบ (ว่าง = ปัจจุบัน)">
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </Field>
            </div>
            {startDate && endDate && endDate < startDate && <span className="text-xs text-destructive">วันที่จบต้องไม่ก่อนวันที่เริ่ม</span>}
          </>
        )}

        {action.kind === "cancel" && m && (
          <AppAlert
            tone="destructive"
            icon={<TriangleAlert />}
            title="ยกเลิกรายการนี้?"
            description={`ใช้กับรายการที่สร้างผิดเท่านั้น (${fmtDate(m.start_date) || "ไม่ระบุ"} – ${fmtDate(m.end_date) || "ปัจจุบัน"}) — ถ้าคนนี้ออกจากห้องจริง ให้ใช้ "ให้ออกจากห้อง" แทน`}
          />
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose} disabled={pending}>ยกเลิก</Button>
        <Button variant={action.kind === "cancel" ? "destructive" : "default"} onClick={submit} disabled={pending || invalid}>
          {pending && <Loader2 className="mr-1 size-4 animate-spin" />}
          {action.kind === "cancel" ? "ยกเลิกรายการ" : "บันทึก"}
        </Button>
      </div>
    </>
  );
}

function Warn({ text }: { text: string }) {
  return <AppAlert tone="warning" icon={<TriangleAlert />} description={text} />;
}

/** ช่วงที่เลือกทับหัวหน้าคนอื่น — บอกว่าใครจะถูกถอดช่วงไหน ก่อนกดบันทึก */
function ReplaceWarn({ rows, from, to }: { rows: OrgMemberRow[]; from: string; to: string | null }) {
  return (
    <AppAlert
      tone="warning"
      icon={<TriangleAlert />}
      title={`ช่วงนี้ทับหัวหน้าคนอื่น ${rows.length} ช่วง — บันทึกแล้วจะถอดเฉพาะส่วนที่ทับ`}
      description={
        <ul className="list-disc pl-4">
          {rows.map((x) => {
            const s = x.start_date && x.start_date > from ? x.start_date : from;
            const e = !to ? x.end_date : !x.end_date || x.end_date > to ? to : x.end_date;
            return (
              <li key={x.Member_ID}>
                {x.Name ?? ""} ({x.UserCode}) · ถอด {fmtDate(s)} – {fmtDate(e) || "ปัจจุบัน"}
              </li>
            );
          })}
        </ul>
      }
    />
  );
}

function ManagerTaken({ m }: { m: OrgMemberRow }) {
  return (
    <AppAlert
      tone="destructive"
      icon={<TriangleAlert />}
      title="ห้องนี้มีหัวหน้าอยู่แล้ว"
      description={`${m.Name ?? ""} (${m.UserCode}) — ถอดหัวหน้าคนเดิมก่อน ไม่อย่างนั้นระบบจะไม่ให้บันทึก`}
    />
  );
}
