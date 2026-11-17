// ชนิดข้อมูลของหน้า /c/admin/org-units — ใช้ได้ทั้ง server และ client

/** ประเภทห้อง — ค่าจริงมาจากตาราง Org_UnitType (COMPANY / LINE / DEPT / SECTION / AREA / TEAM) */
export type UnitType = string;

export type UnitTypeInfo = {
  unit_type: string;
  level_no: number | null; // null = TEAM (ระดับ = rank_no ของตำแหน่งหัวหน้าทีม)
  name_th: string;
  color: string;
  sort_no: number;
};

export type OrgUnitRow = {
  Unit_ID: number;
  ComID: number;
  ComCode: string;
  unit_code: string;
  unit_type: UnitType;
  unit_name: string | null;
  parent_unit_id: number | null;
  manager: string | null;
  manager_position: string | null; // PositionCode ของหัวหน้า
  manager_rank: number | null; // Position.rank_no ของหัวหน้า (ใช้เป็นระดับของ TEAM)
  members: number;
  member_codes: string | null; // UserCode ของสมาชิกปัจจุบัน คั่นด้วย "," (ใช้ค้นหา)
};

export type OrgMemberRow = {
  Member_ID: number;
  Unit_ID: number;
  UserID: number;
  UserCode: string;
  Name: string | null;
  PositionID: number;
  PositionCode: string | null;
  Position: string | null;
  rank_no: number | null;
  is_manager: boolean;
  is_primary: boolean;
  start_date: string | null; // yyyy-mm-dd
  end_date: string | null;
};

/** แถวสมาชิกทุกแถวของห้อง (รวม Actived = 0) + ห้องก่อน/หลังที่ต่อกันพอดี ใช้สร้างปฏิทินหัวหน้าและประวัติ */
export type OrgMemberHistRow = OrgMemberRow & {
  Actived: boolean;
  prev_unit: string | null; // ห้องอื่นที่จบวันก่อน start_date พอดี (ย้ายมาจาก)
  next_unit: string | null; // ห้องอื่นที่เริ่มวันถัดจาก end_date พอดี (ย้ายไป)
  CreateBy: string | null;
  CreateDate: string | null; // yyyy-mm-dd hh:mi
  UpdateBy: string | null;
  UpdateDate: string | null;
};

/** แถวจาก Org_ChangeLog ที่เกี่ยวกับห้องนี้ (json = แถวทั้งแถวก่อน/หลังเปลี่ยน) */
export type OrgLogRow = {
  Log_ID: number;
  table_name: "Org_Member" | "Org_Unit";
  row_id: number;
  action: "I" | "U" | "D";
  old_json: string | null;
  new_json: string | null;
  ChangeBy: string;
  ChangeDate: string; // yyyy-mm-dd hh:mi
};

export type UnitHistory = { rows: OrgMemberHistRow[]; log: OrgLogRow[] };

/** ห้องอื่นของคนหนึ่ง (ใช้เตือนตอนเพิ่มคน) */
export type UserUnitRow = {
  Member_ID: number;
  Unit_ID: number;
  unit_code: string;
  ComCode: string;
  is_manager: boolean;
  is_primary: boolean;
  start_date: string | null;
  end_date: string | null;
};

/** ตำแหน่ง node บนผัง (มุมซ้ายบน ตามที่ React Flow ใช้) */
export type UnitPos = { Unit_ID: number; x: number; y: number };

/** ตำแหน่งที่โหลดมาเป็นของใคร: mine = ของตัวเอง · default = ผังกลาง (UserID 0) · none = ยังไม่มีเลย */
export type PosSource = "mine" | "default" | "none";

export type UnitPositions = { loggedIn: boolean; source: PosSource; rows: UnitPos[] };

export type Option = { value: string; label: string };

export type OrgLookups = {
  companies: { ComID: number; ComCode: string; ComName: string }[];
  /** comId null = ตำแหน่งกลาง ใช้ได้ทุกบริษัท */
  positions: (Option & { code: string; comId: number | null })[];
  users: Option[];
  unitTypes: UnitTypeInfo[];
};

export type ActionResult<T = undefined> =
  | { ok: true; data: T; note?: string | null }
  | { ok: false; error: string };
