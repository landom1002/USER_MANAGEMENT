// กฎของผังห้อง (เตือนเท่านั้น ไม่บังคับ) — ใช้ร่วมกันทั้งหน้าจริงและหน้า mock
// หัวหน้าห้องเป็นตำแหน่งไหนก็ได้ — ไม่ตรวจ
import type { OrgUnitRow, UnitTypeInfo } from "./types";

/** ค่าตั้งต้นเมื่อ DB ยังไม่มีตาราง Org_UnitType (ก่อนรัน db/001_org_unit_types.sql) */
export const DEFAULT_UNIT_TYPES: UnitTypeInfo[] = [
  { unit_type: "COMPANY", level_no: 5, name_th: "บริษัท", color: "#3b82f6", sort_no: 1 },
  { unit_type: "LINE", level_no: 4, name_th: "สายงาน", color: "#8b5cf6", sort_no: 2 },
  { unit_type: "DEPT", level_no: 3, name_th: "ฝ่าย", color: "#10b981", sort_no: 3 },
  { unit_type: "SECTION", level_no: 2, name_th: "แผนก", color: "#f59e0b", sort_no: 4 },
  { unit_type: "AREA", level_no: 1, name_th: "เขต", color: "#ef4444", sort_no: 5 },
  { unit_type: "TEAM", level_no: null, name_th: "ทีม", color: "#64748b", sort_no: 6 },
];

const FALLBACK: UnitTypeInfo ={ unit_type: "?", level_no: null, name_th: "?", color: "#999999", sort_no: 99 };

type LevelInput = Pick<OrgUnitRow, "unit_type" | "manager_rank">;

export class OrgRules {
  private byType: Map<string, UnitTypeInfo>;

  constructor(readonly types: UnitTypeInfo[]) {
    this.byType = new Map(types.map((t) => [t.unit_type, t]));
  }

  type(unitType: string): UnitTypeInfo {
    return this.byType.get(unitType) ?? { ...FALLBACK, unit_type: unitType, name_th: unitType };
  }

  /** ระดับจริงของห้อง: TEAM ใช้ rank_no ของตำแหน่งหัวหน้าทีม (ไม่มีหัวหน้า = ไม่ทราบ) */
  level(u: LevelInput): number | null {
    return this.type(u.unit_type).level_no ?? u.manager_rank ?? null;
  }

  levelLabel(u: LevelInput): string {
    const t = this.type(u.unit_type);
    if (t.level_no != null) return t.name_th;
    const lv = this.level(u);
    const asType = this.types.find((x) => x.level_no === lv);
    return asType ? `${t.name_th} (ระดับ${asType.name_th})` : t.name_th;
  }

  /** ห้องแม่ -> ห้องลูก ผิดระดับไหม — null = ถูก */
  parentWarning(child: LevelInput & Pick<OrgUnitRow, "unit_code">, parent: LevelInput & Pick<OrgUnitRow, "unit_code">): string | null {
    const lc = this.level(child);
    const lp = this.level(parent);
    if (lc == null || lp == null || lp > lc) return null;
    return `${parent.unit_code} (${this.levelLabel(parent)}) ไม่ได้อยู่ระดับสูงกว่า ${child.unit_code} (${this.levelLabel(child)})`;
  }

  /** คำเตือนทั้งหมดของห้อง (แสดงเป็น ⚠ บน node) */
  unitWarnings(u: OrgUnitRow, parent: OrgUnitRow | undefined): string[] {
    const w: string[] = [];
    if (u.unit_type !== "COMPANY" && u.parent_unit_id == null) w.push("ไม่มีห้องแม่");
    if (parent) {
      const pw = this.parentWarning(u, parent);
      if (pw) w.push(pw);
    }
    return w;
  }

  /** ประเภทตั้งต้นของห้องลูก = ประเภทที่ระดับต่ำกว่า 1 ขั้น (ล่างสุด -> TEAM) */
  childDefaultType(parent: LevelInput): string {
    const lv = this.level(parent);
    const next = this.types.find((t) => t.level_no != null && lv != null && t.level_no === lv - 1);
    return next?.unit_type ?? "TEAM";
  }
}
