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

export type MemberAction =
  | { kind: "add"; unit: OrgUnitRow }
  | { kind: "move" | "primary" | "manager" | "end" | "edit" | "cancel"; unit: OrgUnitRow; member: OrgMemberRow };

const TITLES: Record<MemberAction["kind"], string> = {
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
  const key = action ? `${action.kind}-${"member" in action ? action.member.Member_ID : action.unit.Unit_ID}` : "none";
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
  const m = "member" in action ? action.member : null;
  const unit = action.unit;
  const { run, pending } = useRunAction(onDone);
  const { addMember, cancelMember, editMember, endMember, loadUserUnits, moveMember, setManager, setPrimary } = useOrgApi();

  const [date, setDate] = useState(todayStr());
  const [userId, setUserId] = useState("");
  const [positionId, setPositionId] = useState(m ? String(m.PositionID) : "");
  const [isManager, setIsManager] = useState(false);
  const [toUnitId, setToUnitId] = useState("");
  const [startDate, setStartDate] = useState(m?.start_date ?? "");
  const [endDate, setEndDate] = useState(m?.end_date ?? "");
  const [userUnits, setUserUnits] = useState<UserUnitRow[] | null>(null);

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

  // หัวหน้าปัจจุบันของห้องนี้ (ไม่นับคนที่กำลังแก้) — เตือนก่อนส่ง trigger จะ error ให้อยู่ดี
  const otherManager = members.find(
    (x) => x.is_manager && x.Member_ID !== m?.Member_ID && (!x.end_date || x.end_date >= date) && (!x.start_date || x.start_date <= date),
  );
  const targetUnit = toUnitId ? units.find((u) => u.Unit_ID === Number(toUnitId)) : undefined;
  const alreadyInUnit = action.kind === "add" && userUnits?.some((u) => u.Unit_ID === unit.Unit_ID);

  // ตำแหน่งที่เลือกได้ = ตำแหน่งกลาง + ของบริษัทห้องปลายทาง (ย้าย) / ห้องนี้ (อื่น ๆ) — trigger ตรวจซ้ำฝั่ง DB
  const posComId = action.kind === "move" ? (targetUnit?.ComID ?? unit.ComID) : unit.ComID;
  const positionOptions = useMemo(
    () => lookups.positions.filter((p) => p.comId == null || p.comId === posComId),
    [lookups.positions, posComId],
  );
  const positionMismatch = Boolean(positionId) && !positionOptions.some((p) => p.value === positionId);

  const who = m ? `${m.Name ?? ""} (${m.UserCode})` : "";
  const managerOn = action.kind === "manager" && m ? !m.is_manager : false;

  const submit = async () => {
    const by = undefined;
    let ok = false;
    switch (action.kind) {
      case "add":
        ok = await run(
          addMember({ unitId: unit.Unit_ID, userId: Number(userId), positionId: Number(positionId), isManager, date, by }),
          "เพิ่มคนเข้าห้องเรียบร้อยแล้ว",
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
          setManager({ memberId: m!.Member_ID, isManager: managerOn, date, by }),
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

  const invalid =
    (action.kind === "add" && (!userId || !positionId || alreadyInUnit)) ||
    (action.kind === "move" && (!toUnitId || positionMismatch)) ||
    (action.kind === "edit" && (!positionId || Boolean(startDate && endDate && endDate < startDate))) ||
    (action.kind !== "edit" && action.kind !== "cancel" && !date);

  const dateField = (label: string, hint?: string) => (
    <Field label={label}>
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </Field>
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
                title={alreadyInUnit ? "คนนี้อยู่ห้องนี้อยู่แล้ว" : `คนนี้อยู่อีก ${userUnits.length} ห้อง`}
                description={userUnits
                  .map((u) => `${u.ComCode}·${u.unit_code}${u.is_primary ? " (ห้องหลัก)" : ""}${u.is_manager ? " (หัวหน้า)" : ""}`)
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
            {dateField("วันที่เริ่ม")}
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
            {managerOn && otherManager && <ManagerTaken m={otherManager} />}
            {!managerOn && <Warn text={`ห้อง ${unit.unit_code} จะไม่มีหัวหน้าตั้งแต่วันที่มีผล — สายอนุมัติจะขึ้นไปห้องแม่`} />}
            {dateField("วันที่มีผล", "ถ้ารายการเริ่มก่อนวันนี้ จะแบ่งเป็น 2 แถว (เดิมจบก่อน 1 วัน / ใหม่เริ่มวันนี้)")}
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
