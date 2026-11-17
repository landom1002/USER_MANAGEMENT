"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Building2, Loader2 } from "lucide-react";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Combobox, type ComboboxOption } from "@/components/ui/cbo-liveserch";
import type { OrgLookups, OrgUnitRow } from "@/lib/org/types";
import { cn } from "@/lib/utils";
import { useOrgApi } from "./api";
import { useOrgRules, useRunAction } from "./shared";

/** hover แล้วขึ้นเส้นประใต้ข้อความ (แบบ Trello) — บอกว่าดับเบิลคลิกแก้ได้ */
const HINT = "cursor-text decoration-muted-foreground/60 decoration-dashed decoration-1 underline-offset-4 hover:underline";

type Patch = Partial<{ unit_code: string; unit_name: string; unit_type: string }>;

/** ฟิลด์ที่สั่งแก้ inline จากภายนอกได้ (เช่น เมนูจัดการห้อง) */
export type UnitEditField = "code" | "name";

/**
 * หัวการ์ดห้องในหน้าต่างสมาชิก — ดับเบิลคลิกแต่ละฟิลด์เพื่อแก้ แล้วบันทึกทีละฟิลด์
 * แถวบน: รหัส · ประเภท · ชื่อห้อง / แถวล่าง: บริษัท
 */
export function UnitTitleFields({ unit, lookups, loading, onUnits, editing, onEditing }: {
  unit: OrgUnitRow; lookups: OrgLookups; loading?: boolean; onUnits: (u: OrgUnitRow[]) => void;
  /** ฟิลด์ที่กำลังแก้อยู่ (ควบคุมจากภายนอก) */
  editing: UnitEditField | null;
  onEditing: (f: UnitEditField | null) => void;
}) {
  const api = useOrgApi();
  const rules = useOrgRules(lookups);
  const { run, pending } = useRunAction(onUnits);
  const isCompany = unit.unit_type === "COMPANY";
  const color = rules.type(unit.unit_type).color;

  // server รับทุกฟิลด์ -> ส่งค่าปัจจุบันไปด้วย แล้วทับเฉพาะฟิลด์ที่แก้
  const save = (patch: Patch, msg: string) =>
    run(
      api.updateUnit({
        unitId: unit.Unit_ID,
        unit_code: unit.unit_code,
        unit_name: unit.unit_name ?? "",
        unit_type: unit.unit_type,
        ...patch,
      }),
      msg,
    );

  const typeOptions = rules.types
    .filter((t) => t.unit_type !== "COMPANY")
    .map((t) => ({ value: t.unit_type, label: t.name_th }));

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      {/* แถวบน */}
      <div className="flex min-w-0 items-center gap-2.5">
        <DialogTitle className="shrink-0 font-mono text-lg font-semibold">
          <InlineText
            value={unit.unit_code}
            required
            maxLength={40}
            label="รหัสห้อง"
            editing={editing === "code"}
            onEditing={(on) => onEditing(on ? "code" : null)}
            inputClassName="w-36 font-mono text-lg font-semibold"
            onSave={(v) => save({ unit_code: v }, "เปลี่ยนรหัสห้องแล้ว")}
          />
        </DialogTitle>
        <InlineSelect
          value={unit.unit_type}
          options={typeOptions}
          disabled={isCompany}
          className="w-36"
          onSave={(v) => save({ unit_type: v }, "เปลี่ยนประเภทห้องแล้ว")}
        >
          <span
            className={cn("shrink-0 rounded px-1.5 py-px text-[11px] font-medium text-white", !isCompany && "cursor-pointer hover:opacity-85")}
            style={{ background: color }}
            title={isCompany ? undefined : "ดับเบิลคลิกเพื่อเปลี่ยนประเภท"}
          >
            {rules.levelLabel(unit)}
          </span>
        </InlineSelect>
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
          <InlineText
            value={unit.unit_name ?? ""}
            maxLength={150}
            label="ชื่อห้อง"
            editing={editing === "name"}
            onEditing={(on) => onEditing(on ? "name" : null)}
            placeholder="+ เพิ่มชื่อห้อง"
            inputClassName="w-full max-w-md text-[15px] font-medium"
            onSave={(v) => save({ unit_name: v }, "เปลี่ยนชื่อห้องแล้ว")}
          />
        </span>
        {(pending || loading) && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />}
      </div>

      {/* แถวล่าง */}
      <DialogDescription asChild>
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground [&_svg]:size-3.5 [&_svg]:shrink-0">
          <span className="flex items-center gap-1.5">
            <Building2 /> {unit.ComCode}
          </span>
        </div>
      </DialogDescription>
    </div>
  );
}

type InlineTextProps = {
  value: string;
  onSave: (v: string) => Promise<boolean>;
  label: string;
  placeholder?: string;
  maxLength?: number;
  required?: boolean;
  inputClassName?: string;
  editing: boolean;
  onEditing: (on: boolean) => void;
};

/** ข้อความ -> ดับเบิลคลิก (หรือสั่งจากเมนู) เป็น input · Enter/คลิกออก = บันทึก · Esc = ยกเลิก */
function InlineText({ value, placeholder, label, editing, onEditing, ...rest }: InlineTextProps) {
  if (!editing) {
    return (
      <span
        className={cn(HINT, !value && "font-normal text-muted-foreground")}
        title={`ดับเบิลคลิกเพื่อแก้${label}`}
        onDoubleClick={() => onEditing(true)}
      >
        {value || placeholder}
      </span>
    );
  }
  // mount ใหม่ทุกครั้งที่เริ่มแก้ -> draft เริ่มจากค่าปัจจุบันเสมอ
  return <InlineInput value={value} label={label} onDone={() => onEditing(false)} {...rest} />;
}

function InlineInput({ value, onSave, onDone, label, maxLength, required, inputClassName }:
  Omit<InlineTextProps, "editing" | "onEditing" | "placeholder"> & { onDone: () => void }) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  // โฟกัสหลัง frame ถัดไป — กันเมนู dropdown ที่กำลังปิดแย่งโฟกัสคืน
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const commit = async () => {
    if (saving) return;
    const v = draft.trim();
    if (v === value.trim() || (required && !v)) return onDone();
    setSaving(true);
    const ok = await onSave(v);
    setSaving(false);
    if (ok) onDone();
  };

  return (
    <input
      ref={ref}
      data-inline-edit
      aria-label={label}
      value={draft}
      maxLength={maxLength}
      disabled={saving}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { e.preventDefault(); onDone(); }
      }}
      className={cn(
        "-mx-1 rounded-md border border-input bg-background px-1 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60",
        inputClassName,
      )}
    />
  );
}

/** ค่าแสดงผล -> ดับเบิลคลิกเป็น Combobox (เปิดรายการทันที) · เลือก = บันทึก · ปิดรายการ = เลิกแก้ */
function InlineSelect({ value, options, onSave, disabled, className, children }: {
  value: string;
  options: ComboboxOption[];
  onSave: (v: string) => Promise<boolean>;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <span className="flex min-w-0" onDoubleClick={() => !disabled && setEditing(true)}>
        {children}
      </span>
    );
  }
  return (
    <Combobox
      defaultOpen
      options={options}
      value={value}
      className={cn("h-8", className)}
      onOpenChange={(o) => !o && setEditing(false)}
      onValueChange={(v) => {
        if (v !== value) onSave(v);
      }}
    />
  );
}
