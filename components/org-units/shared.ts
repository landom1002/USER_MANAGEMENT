"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { OrgRules } from "@/lib/org/rules";
import type { ActionResult, OrgLookups, OrgUnitRow } from "@/lib/org/types";

/** กฎ + ข้อมูลประเภทห้อง (สี / ชื่อไทย / ระดับ) จาก lookups */
export function useOrgRules(lookups: OrgLookups) {
  return useMemo(() => new OrgRules(lookups.unitTypes), [lookups.unitTypes]);
}

/** สีพื้น/ขอบของ node จากสีประเภทห้อง (โปร่งแสง — ใช้ได้ทั้งโหมดสว่างและมืด) */
export const tint = (color: string) => ({
  borderColor: color,
  background: `color-mix(in srgb, ${color} 10%, var(--card))`,
});

/** วันนี้ตามเวลาเครื่อง ในรูป yyyy-mm-dd */
export const todayStr = () => new Date().toLocaleDateString("sv-SE");

/** yyyy-mm-dd -> dd/mm/yyyy */
export const fmtDate = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");

export const unitLabel = (u: Pick<OrgUnitRow, "ComCode" | "unit_code" | "unit_name">) =>
  `${u.ComCode} · ${u.unit_code}${u.unit_name ? ` - ${u.unit_name}` : ""}`;

/**
 * เรียก Server Action ที่คืน ActionResult<OrgUnitRow[]>:
 * สำเร็จ -> toast + ส่ง units ใหม่ให้ canvas / ไม่สำเร็จ -> toast error แล้วคืน false
 */
export function useRunAction(onUnits: (units: OrgUnitRow[]) => void) {
  const [pending, setPending] = useState(false);
  const run = useCallback(
    async (p: Promise<ActionResult<OrgUnitRow[]>>, success: string): Promise<boolean> => {
      setPending(true);
      try {
        const r = await p;
        if (!r.ok) {
          toast.error(r.error);
          return false;
        }
        onUnits(r.data);
        toast.success(success);
        if (r.note) toast.info(r.note, { duration: 8000 });
        return true;
      } catch {
        toast.error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง");
        return false;
      } finally {
        setPending(false);
      }
    },
    [onUnits],
  );
  return { run, pending };
}
