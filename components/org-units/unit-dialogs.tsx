"use client";

import { useState } from "react";
import { ArrowRight, Loader2, TriangleAlert, Undo2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/cbo-liveserch";
import { AppAlert } from "@/components/common/app-alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { OrgLookups, OrgUnitRow } from "@/lib/org/types";
import { cn } from "@/lib/utils";
import { useOrgApi } from "./api";
import { unitLabel, useOrgRules, useRunAction } from "./shared";


function Footer({ onCancel, onOk, pending, disabled, okText = "บันทึก", destructive }: {
  onCancel: () => void; onOk: () => void; pending: boolean; disabled?: boolean; okText?: string; destructive?: boolean;
}) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button variant="outline" onClick={onCancel} disabled={pending}>ยกเลิก</Button>
      <Button variant={destructive ? "destructive" : "default"} onClick={onOk} disabled={pending || disabled}>
        {pending && <Loader2 className="mr-1 size-4 animate-spin" />}
        {okText}
      </Button>
    </div>
  );
}

export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- เปลี่ยนห้องแม่ (หลังลากเส้น)

export function ConfirmParentDialog({ pending: p, stats, levelWarning, currentParent, onClose, onUnits }: {
  pending: { child: OrgUnitRow; parent: OrgUnitRow } | null;
  stats: { units: number; people: number } | null;
  levelWarning: string | null;
  currentParent: OrgUnitRow | null;
  onClose: () => void;
  onUnits: (u: OrgUnitRow[]) => void;
}) {
  const api = useOrgApi();
  const { run, pending } = useRunAction(onUnits);
  return (
    <Dialog open={Boolean(p)} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>เปลี่ยนห้องแม่</DialogTitle>
          <DialogDescription>ย้าย {p?.child.unit_code} ไปอยู่ใต้ห้องใหม่</DialogDescription>
        </DialogHeader>
        {p && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="rounded-md border px-2 py-1 font-mono text-xs">{currentParent?.unit_code ?? "(ไม่มี)"}</span>
              <ArrowRight className="size-4 text-muted-foreground" />
              <span className="rounded-md border border-primary bg-primary/5 px-2 py-1 font-mono text-xs">{p.parent.unit_code}</span>
              <span className="truncate text-xs text-muted-foreground">{p.parent.unit_name}</span>
            </div>
            {levelWarning && (
              <AppAlert tone="destructive" icon={<TriangleAlert />} title="ผิดลำดับระดับ (บันทึกได้แต่จะมี ⚠)" description={levelWarning} />
            )}
            {stats && (
              <AppAlert
                tone="warning"
                icon={<TriangleAlert />}
                title="สายอนุมัติจะเปลี่ยนตามผังใหม่ทันที"
                description={`มีผลกับ ${p.child.unit_code} และห้องลูกอีก ${stats.units} ห้อง · รวม ${stats.people.toLocaleString("th-TH")} คน`}
              />
            )}
          </div>
        )}
        <Footer
          onCancel={onClose}
          pending={pending}
          onOk={async () => {
            if (!p) return;
            if (await run(api.setParent({ unitId: p.child.Unit_ID, parentId: p.parent.Unit_ID }), "เปลี่ยนห้องแม่เรียบร้อยแล้ว")) onClose();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- ห้องระดับบริษัท (ราก)

export function CompanyUnitDialog({ open, companies, onClose, onUnits }: {
  open: boolean;
  companies: OrgLookups["companies"];
  onClose: () => void;
  onUnits: (u: OrgUnitRow[]) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {open && <CompanyUnitForm companies={companies} onClose={onClose} onUnits={onUnits} />}
      </DialogContent>
    </Dialog>
  );
}

function CompanyUnitForm({ companies, onClose, onUnits }: {
  companies: OrgLookups["companies"]; onClose: () => void; onUnits: (u: OrgUnitRow[]) => void;
}) {
  const api = useOrgApi();
  const { run, pending } = useRunAction(onUnits);
  const [comId, setComId] = useState(companies[0] ? String(companies[0].ComID) : "");
  const com = companies.find((c) => String(c.ComID) === comId);
  const [code, setCode] = useState(com?.ComCode ?? "");
  const [name, setName] = useState(com?.ComName ?? "");
  const options = companies.map((c) => ({ value: String(c.ComID), label: `${c.ComCode} - ${c.ComName}` }));

  return (
    <>
      <DialogHeader>
        <DialogTitle>สร้างห้องระดับบริษัท</DialogTitle>
        <DialogDescription>ห้องรากของผัง — หัวหน้าควรเป็น MD หรือ GM</DialogDescription>
      </DialogHeader>
      {companies.length === 0 ? (
        <p className="text-sm text-muted-foreground">ทุกบริษัทมีห้องระดับบริษัทแล้ว</p>
      ) : (
        <div className="flex flex-col gap-3">
          <Field label="บริษัท *">
            <Combobox
              options={options}
              value={comId}
              onValueChange={(v) => {
                setComId(v);
                const c = companies.find((x) => String(x.ComID) === v);
                setCode(c?.ComCode ?? "");
                setName(c?.ComName ?? "");
              }}
            />
          </Field>
          <Field label="รหัสห้อง *">
            <Input value={code} onChange={(e) => setCode(e.target.value)} maxLength={40} />
          </Field>
          <Field label="ชื่อห้อง">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={150} />
          </Field>
        </div>
      )}
      <Footer
        onCancel={onClose}
        pending={pending}
        disabled={!comId || !code.trim()}
        onOk={async () => {
          if (await run(api.createCompanyUnit({ comId: Number(comId), unit_code: code, unit_name: name }), `สร้างห้อง ${code} แล้ว`)) onClose();
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------- เพิ่ม / แก้ไขห้อง

export type UnitFormState = { mode: "create"; parent: OrgUnitRow } | { mode: "edit"; unit: OrgUnitRow };

export function UnitFormDialog({ state, lookups, onClose, onUnits }: {
  state: UnitFormState | null; lookups: OrgLookups; onClose: () => void; onUnits: (u: OrgUnitRow[]) => void;
}) {
  // remount ฟอร์มทุกครั้งที่เปิดใหม่ เพื่อให้ค่าเริ่มต้นตรงกับห้องที่เลือก
  const key = state ? (state.mode === "create" ? `c${state.parent.Unit_ID}` : `e${state.unit.Unit_ID}`) : "none";
  return (
    <Dialog open={Boolean(state)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {state && <UnitForm key={key} state={state} lookups={lookups} onClose={onClose} onUnits={onUnits} />}
      </DialogContent>
    </Dialog>
  );
}

function UnitForm({ state, lookups, onClose, onUnits }: {
  state: UnitFormState; lookups: OrgLookups; onClose: () => void; onUnits: (u: OrgUnitRow[]) => void;
}) {
  const api = useOrgApi();
  const rules = useOrgRules(lookups);
  const editing = state.mode === "edit" ? state.unit : null;
  const parent = state.mode === "create" ? state.parent : null;
  const [code, setCode] = useState(editing?.unit_code ?? "");
  const [name, setName] = useState(editing?.unit_name ?? "");
  const [type, setType] = useState<string>(editing?.unit_type ?? rules.childDefaultType(parent!));
  const { run, pending } = useRunAction(onUnits);
  const isCompany = editing?.unit_type === "COMPANY";

  // เตือนผิดระดับ: เทียบกับห้องแม่ (สร้างใหม่) หรือหัวหน้าปัจจุบัน (แก้ไข)
  const preview = { unit_type: type, manager_rank: editing?.manager_rank ?? null, unit_code: editing?.unit_code ?? (code || "ห้องใหม่") };
  const levelWarn = parent ? rules.parentWarning(preview, parent) : null;

  const submit = async () => {
    const common = { unit_code: code, unit_name: name, unit_type: type };
    const ok = editing
      ? await run(api.updateUnit({ unitId: editing.Unit_ID, ...common }), "บันทึกห้องเรียบร้อยแล้ว")
      : await run(api.createUnit({ parentId: parent!.Unit_ID, ...common }), `เพิ่มห้อง ${code} เรียบร้อยแล้ว`);
    if (ok) onClose();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? `แก้ไขห้อง ${editing.unit_code}` : "เพิ่มห้องลูก"}</DialogTitle>
        <DialogDescription>{editing ? unitLabel(editing) : `ใต้ ${unitLabel(parent!)}`}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        <Field label="รหัสห้อง *">
          <Input value={code} onChange={(e) => setCode(e.target.value)} maxLength={40} placeholder="เช่น 101ITO" />
        </Field>
        <Field label="ชื่อห้อง">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={150} />
        </Field>
        <Field label="ประเภท">
          <div className="flex flex-wrap gap-1.5">
            {rules.types
              .filter((t) => (isCompany ? t.unit_type === "COMPANY" : t.unit_type !== "COMPANY"))
              .map((t) => (
                <button
                  key={t.unit_type}
                  type="button"
                  disabled={isCompany}
                  onClick={() => setType(t.unit_type)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs transition-colors",
                    type === t.unit_type ? "border-transparent text-white" : "hover:bg-muted",
                  )}
                  style={type === t.unit_type ? { background: t.color } : undefined}
                >
                  {t.name_th}
                </button>
              ))}
          </div>
          {type === "TEAM" && (
            <span className="text-[11px] text-muted-foreground">
              ทีม = กลุ่มสายรายงาน ใช้แบ่งคนในห้องเดียวกันให้ขึ้นกับหัวหน้าคนละคน · ระดับของทีมตามตำแหน่งหัวหน้าทีม
            </span>
          )}
        </Field>
        {levelWarn && <AppAlert tone="warning" icon={<TriangleAlert />} description={levelWarn} />}
      </div>
      <Footer onCancel={onClose} onOk={submit} pending={pending} disabled={!code.trim()} />
    </>
  );
}

// ---------------------------------------------------------------- ปิดห้อง

const UNDO_MS = 10_000;

/**
 * ปิดห้อง (Actived = 0) — ห้ามปิดห้องบริษัท / ห้องที่มีห้องลูก / ห้องที่มีคน (ห้องที่มีคน -> ปุ่มไปเปิดรายชื่อสมาชิก)
 * ปิดสำเร็จ -> toast มีปุ่ม "เลิกทำ" (เรียก reactivateUnit) ภายใน 10 วินาที
 */
export function DeactivateUnitDialog({ unit, childCount, onClose, onDone, onUnits, onOpenMembers }: {
  unit: OrgUnitRow | null;
  childCount: number;
  onClose: () => void;
  /** ปิดห้องสำเร็จ — units ใหม่ */
  onDone: (u: OrgUnitRow[]) => void;
  /** units ใหม่หลังเลิกทำ (เปิดห้องกลับ) */
  onUnits: (u: OrgUnitRow[]) => void;
  /** ห้องยังมีคน -> ไปจัดการคนในรายชื่อสมาชิก */
  onOpenMembers?: (u: OrgUnitRow) => void;
}) {
  const api = useOrgApi();
  const [pending, setPending] = useState(false);
  const people = unit?.members ?? 0;
  const reason = !unit
    ? null
    : unit.unit_type === "COMPANY"
      ? "ปิดห้องระดับบริษัทไม่ได้"
      : childCount > 0
        ? `ยังมีห้องลูก ${childCount} ห้อง — ย้ายห้องลูกก่อน`
        : people > 0
          ? `ยังมีคนในห้อง ${people.toLocaleString("th-TH")} คน — ย้ายคนหรือให้ออกก่อน`
          : null;
  const blocked = !unit || reason != null;
  const hasPeople = Boolean(unit) && unit!.unit_type !== "COMPANY" && childCount === 0 && people > 0;

  const reopen = async (u: OrgUnitRow) => {
    try {
      const r = await api.reactivateUnit({ unitId: u.Unit_ID });
      if (!r.ok) return void toast.error(r.error);
      onUnits(r.data);
      toast.success(`เปิดห้อง ${u.unit_code} กลับแล้ว`);
    } catch {
      toast.error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง");
    }
  };

  const deactivate = async () => {
    if (!unit) return;
    const u = unit;
    setPending(true);
    try {
      const r = await api.deactivateUnit({ unitId: u.Unit_ID });
      if (!r.ok) return void toast.error(r.error);
      onDone(r.data);
      onClose();
      toast.success(`ปิดห้อง ${u.unit_code} แล้ว`, {
        duration: UNDO_MS,
        action: {
          label: (
            <span className="flex items-center gap-1">
              <Undo2 className="size-3.5" /> เลิกทำ
            </span>
          ),
          onClick: () => void reopen(u),
        },
      });
    } catch {
      toast.error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={Boolean(unit)} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>ปิดห้อง {unit?.unit_code}</DialogTitle>
          <DialogDescription>{unit && unitLabel(unit)}</DialogDescription>
        </DialogHeader>
        {unit && (
          <AppAlert
            tone={blocked ? "destructive" : "warning"}
            icon={<TriangleAlert />}
            title={reason ?? "ห้องจะหายจากผัง (ไม่ลบข้อมูล)"}
            description={
              !blocked
                ? "ระบบจะตรวจคนที่ตั้งไว้ล่วงหน้าอีกครั้งตอนบันทึก · ปิดแล้วกด \"เลิกทำ\" ได้ภายใน 10 วินาที"
                : undefined
            }
          />
        )}
        {hasPeople && onOpenMembers ? (
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
            <Button onClick={() => unit && onOpenMembers(unit)}>
              <Users className="size-4" /> เปิดรายชื่อสมาชิก
            </Button>
          </div>
        ) : (
          <Footer onCancel={onClose} pending={pending} disabled={blocked} destructive okText="ปิดห้อง" onOk={deactivate} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** ยืนยันตั้งผังของตัวเองเป็นผังกลาง — แทนที่ผังกลางเดิมทั้งชุด */
export function PublishLayoutDialog({ open, pending, onClose, onOk }: {
  open: boolean; pending: boolean; onClose: () => void; onOk: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>ตั้งเป็นผังกลาง</DialogTitle>
          <DialogDescription>คนที่ยังไม่เคยจัดผังของตัวเองจะเห็นตำแหน่งห้องตามผังนี้</DialogDescription>
        </DialogHeader>
        <AppAlert tone="warning" icon={<TriangleAlert />} title="ผังกลางเดิมจะถูกแทนที่ทั้งชุด" />
        <Footer onCancel={onClose} onOk={onOk} pending={pending} okText="ตั้งเป็นผังกลาง" />
      </DialogContent>
    </Dialog>
  );
}
