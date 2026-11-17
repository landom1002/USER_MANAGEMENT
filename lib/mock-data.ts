import type { OrgItem, Policy, TeamMember, UserProfile } from "./types";

// ─── Master data ──────────────────────────────────────────────────────────────

export const POLICIES: Policy[] = [
  { evaluation_policy_id: 3, title: "รอบประเมินปี 2026", evaluation_year: 2026 },
  { evaluation_policy_id: 2, title: "รอบประเมินปี 2025", evaluation_year: 2025 },
  { evaluation_policy_id: 1, title: "รอบประเมินปี 2024 (ว่าง)", evaluation_year: 2024 },
];

export const COMPANIES: OrgItem[] = [
  { id: 1, code: "HQ", name: "บริษัท ตัวอย่างโฮลดิ้ง จำกัด" },
  { id: 2, code: "LOG", name: "บริษัท ตัวอย่างโลจิสติกส์ จำกัด" },
  { id: 3, code: "RTL", name: "บริษัท ตัวอย่างค้าปลีก จำกัด" },
];

export const DEPARTMENTS: OrgItem[] = [
  { id: 1, code: "EXE", name: "ฝ่ายบริหาร" },
  { id: 2, code: "OPS", name: "ฝ่ายปฏิบัติการ" },
  { id: 3, code: "FIN", name: "ฝ่ายบัญชีและการเงิน" },
  { id: 4, code: "ITD", name: "ฝ่ายเทคโนโลยีสารสนเทศ" },
  { id: 5, code: "SAL", name: "ฝ่ายขายและการตลาด" },
  { id: 6, code: "HRD", name: "ฝ่ายทรัพยากรบุคคล" },
];

export const SECTIONS: OrgItem[] = [
  { id: 1, code: "EXE-01", name: "สำนักกรรมการผู้จัดการ" },
  { id: 2, code: "OPS-01", name: "แผนกคลังสินค้า" },
  { id: 3, code: "OPS-02", name: "แผนกขนส่ง" },
  { id: 4, code: "FIN-01", name: "แผนกบัญชี" },
  { id: 5, code: "FIN-02", name: "แผนกการเงิน" },
  { id: 6, code: "ITD-01", name: "แผนกพัฒนาระบบ" },
  { id: 7, code: "ITD-02", name: "แผนกโครงสร้างพื้นฐาน" },
  { id: 8, code: "SAL-01", name: "แผนกขายภาคกลาง" },
  { id: 9, code: "SAL-02", name: "แผนกการตลาดดิจิทัล" },
  { id: 10, code: "HRD-01", name: "แผนกสรรหาและพัฒนา" },
];

export const POSITIONS: OrgItem[] = [
  { id: 1, code: "P01", name: "กรรมการผู้จัดการ" },
  { id: 2, code: "P02", name: "ผู้อำนวยการฝ่าย" },
  { id: 3, code: "P03", name: "ผู้จัดการแผนก" },
  { id: 4, code: "P04", name: "หัวหน้างาน" },
  { id: 5, code: "P05", name: "เจ้าหน้าที่อาวุโส" },
  { id: 6, code: "P06", name: "เจ้าหน้าที่" },
];

// ─── Users directory ─────────────────────────────────────────────────────────

const NAMES = [
  "สมชาย ใจดี", "วิภาวรรณ ศรีสุข", "ประเสริฐ มั่นคง", "อรุณี แสงทอง", "ธนากร พูลผล",
  "กมลชนก วงศ์ใหญ่", "ณัฐพล บุญมา", "สุภาพร คงเจริญ", "ปิยะพงษ์ ทองดี", "จิราพร สายสุวรรณ",
  "อนุชา รัตนกุล", "พิมพ์ชนก อินทร์แก้ว", "วีระยุทธ ชัยมงคล", "ศิริพร ปัญญาดี", "ชยพล เกษมสุข",
  "นันทนา ภู่ระหงษ์", "เกียรติศักดิ์ ศรีวงศ์", "มาลัย จันทร์เพ็ญ", "ภานุวัฒน์ ทรัพย์มาก", "รัชนี สุขสวัสดิ์",
  "ธีรวัฒน์ แก้วประเสริฐ", "อัญชลี บุญประเสริฐ", "สุรเชษฐ์ วงศ์ทอง", "ปวีณา ศักดิ์ดี", "ทศพล นาคสวัสดิ์",
  "เบญจวรรณ ทองคำ", "ชาตรี ประสิทธิ์ผล", "ลลิตา มณีรัตน์", "พงศกร อุดมสุข", "วรรณา เรืองศรี",
  "กิตติพัฒน์ สมบูรณ์", "ดวงใจ รุ่งเรือง", "อำนาจ ศรีสมบัติ", "ปาริชาติ ไชยวงศ์", "นพดล พรหมมา",
  "สุนิสา เพชรรัตน์", "ไพโรจน์ สิงห์ทอง", "กัญญารัตน์ พึ่งบุญ", "วสันต์ ชื่นใจ", "เยาวลักษณ์ ศรีจันทร์",
];

export const USERS: UserProfile[] = NAMES.map((name, i) => {
  const id = i + 1;
  const code = `EMP${String(id).padStart(4, "0")}`;
  return {
    UserID: id,
    UserCode: code,
    Name: name,
    DepID: null, depcode: null, depname: null,
    SecID: null, seccode: null, secname: null,
    PositionID: null, positioncode: null, positionname: null,
    Email: `${code.toLowerCase()}@example.co.th`,
    Tel: `08${String(10000000 + id * 1234567).slice(0, 8)}`,
    Actived: id !== 40, // คนสุดท้ายลาออกแล้ว — ไม่ถูกแสดงในแผนผัง
    empUserID: null, empUserCode: "", empName: "",
  };
});

// ─── Plans per policy ────────────────────────────────────────────────────────
// [ownerId, approverId | null, comId, secId, positionId]

type PlanRow = [number, number | null, number, number, number];

const SEC_TO_DEP: Record<number, number> = { 1: 1, 2: 2, 3: 2, 4: 3, 5: 3, 6: 4, 7: 4, 8: 5, 9: 5, 10: 6 };

const PLAN_ROWS: Record<number, PlanRow[]> = {
  3: [
    // Root #1 — กรรมการผู้จัดการ
    [1, null, 1, 1, 1],
    //   ผอ. ฝ่าย
    [2, 1, 2, 2, 2],
    [3, 1, 1, 4, 2],
    [4, 1, 1, 6, 2],
    //     ผจก. แผนก
    [5, 2, 2, 2, 3],
    [6, 2, 2, 3, 3],
    [7, 3, 1, 4, 3],
    [8, 3, 1, 5, 3],
    [9, 4, 1, 6, 3],
    [9, 4, 1, 7, 3], // คนเดียวกันมี 2 แผน (ย้ายแผนกกลางปี)
    [10, 4, 1, 7, 4],
    //       เจ้าหน้าที่
    [11, 5, 2, 2, 5], [12, 5, 2, 2, 6], [13, 5, 2, 2, 6],
    [14, 6, 2, 3, 5], [15, 6, 2, 3, 6],
    [16, 7, 1, 4, 5], [17, 7, 1, 4, 6], [18, 7, 1, 4, 6],
    [19, 8, 1, 5, 6],
    [20, 9, 1, 6, 4], [21, 9, 1, 6, 5], [22, 9, 1, 6, 6], [23, 9, 1, 6, 6],
    [24, 10, 1, 7, 5], [25, 10, 1, 7, 6],
    [36, 20, 1, 6, 6], [37, 20, 1, 6, 6],
    // Root #2 — ฝ่ายขาย (ยังไม่ผูกเข้ากับกรรมการผู้จัดการ)
    [26, null, 3, 8, 2],
    [27, 26, 3, 8, 3], [28, 27, 3, 8, 5], [29, 27, 3, 8, 6], [30, 27, 3, 8, 6],
    [31, 26, 3, 9, 3], [32, 31, 3, 9, 6],
    // Orphans — ยังไม่ได้กำหนดหัวหน้า และไม่มีลูกทีม
    [33, null, 1, 10, 3], [34, null, 1, 10, 6], [35, null, 2, 3, 6],
    [38, null, 3, 9, 6], [39, null, 1, 10, 6],
    // ผู้ใช้ที่ไม่ active
    [40, 5, 2, 2, 6],
  ],
  2: [
    [1, null, 1, 1, 1],
    [2, 1, 2, 2, 2], [3, 1, 1, 4, 2],
    [5, 2, 2, 2, 3], [6, 2, 2, 3, 3], [7, 3, 1, 4, 3],
    [11, 5, 2, 2, 6], [12, 5, 2, 2, 6], [14, 6, 2, 3, 6], [15, 6, 2, 3, 6],
    [16, 7, 1, 4, 6], [17, 7, 1, 4, 6],
    [26, null, 3, 8, 2], [27, 26, 3, 8, 3], [28, 27, 3, 8, 6],
    [33, null, 1, 10, 3], [34, null, 1, 10, 6],
  ],
  1: [],
};

const findItem = (list: OrgItem[], id: number | null) => list.find((x) => x.id === id) ?? null;

export function buildTeamMember(
  planCode: string,
  planId: number,
  owner: UserProfile,
  approverId: number | null,
  comId: number | null,
  secId: number | null,
  positionId: number | null,
  depIdOverride?: number | null,
): TeamMember {
  const approver = USERS.find((u) => u.UserID === approverId) ?? null;
  const depId = depIdOverride !== undefined ? depIdOverride : secId ? SEC_TO_DEP[secId] ?? null : null;
  const com = findItem(COMPANIES, comId);
  const dep = findItem(DEPARTMENTS, depId);
  const sec = findItem(SECTIONS, secId);
  const pos = findItem(POSITIONS, positionId);
  return {
    ...owner,
    DepID: dep?.id ?? null, depcode: dep?.code ?? null, depname: dep?.name ?? null,
    SecID: sec?.id ?? null, seccode: sec?.code ?? null, secname: sec?.name ?? null,
    PositionID: pos?.id ?? null, positioncode: pos?.code ?? null, positionname: pos?.name ?? null,
    empUserID: approver?.UserID ?? null,
    empUserCode: approver?.UserCode ?? "",
    empName: approver?.Name ?? "",
    kpi_plan_code: planCode,
    kpi_plan_id: planId,
    com_id: com?.id ?? null,
    com_code: com?.code ?? null,
    com_name: com?.name ?? null,
  };
}

export function createInitialPlans(): Record<string, TeamMember[]> {
  const result: Record<string, TeamMember[]> = {};
  let planId = 1;
  for (const policy of POLICIES) {
    const rows = PLAN_ROWS[policy.evaluation_policy_id] ?? [];
    result[String(policy.evaluation_policy_id)] = rows.map(([ownerId, approverId, comId, secId, posId], i) => {
      const owner = USERS.find((u) => u.UserID === ownerId)!;
      const planCode = `KP${policy.evaluation_year % 100}-${String(i + 1).padStart(4, "0")}`;
      return buildTeamMember(planCode, planId++, owner, approverId, comId, secId, posId);
    });
  }
  return result;
}
