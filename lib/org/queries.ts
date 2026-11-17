import "server-only";
import { getPool, sql } from "@/lib/db";
import { DEFAULT_UNIT_TYPES } from "./rules";
import type {
  OrgLogRow, OrgLookups, OrgMemberHistRow, OrgUnitRow, PosSource, UnitHistory, UnitPos, UnitTypeInfo, UserUnitRow,
} from "./types";

// วันที่ทุกตัวแปลงเป็น 'yyyy-mm-dd' ใน SQL เลย — เลี่ยงปัญหา timezone ของ Date ใน JS

export async function getUnits(): Promise<OrgUnitRow[]> {
  const pool = await getPool();
  const r = await pool.request().query<OrgUnitRow>(`
    SELECT v.Unit_ID, v.ComID, c.ComCode, v.unit_code, v.unit_type, v.unit_name,
           u.parent_unit_id,
           v.manager, v.manager_position, mr.rank_no AS manager_rank, ISNULL(v.members, 0) AS members,
           STUFF((SELECT ',' + us.UserCode FROM dbo.Org_Member m
                  JOIN dbo.Users us ON us.UserID = m.UserID
                  WHERE m.Unit_ID = v.Unit_ID AND m.Actived = 1
                    AND (m.start_date IS NULL OR m.start_date <= CAST(GETDATE() AS date))
                    AND (m.end_date IS NULL OR m.end_date >= CAST(GETDATE() AS date))
                  FOR XML PATH('')), 1, 1, '') AS member_codes
    FROM dbo.vw_Org_Unit v
    JOIN dbo.Org_Unit u ON u.Unit_ID = v.Unit_ID
    JOIN dbo.Company c  ON c.ComID = v.ComID
    OUTER APPLY (SELECT TOP 1 p.rank_no FROM dbo.Position p WHERE p.PositionCode = v.manager_position) mr
    ORDER BY v.ComID, v.unit_code`);
  return r.recordset;
}

/**
 * ประวัติทั้งหมดของห้อง
 * - rows: ทุกแถวใน Org_Member ของห้อง (รวม Actived = 0) + ห้องที่ต่อกันพอดีก่อน/หลัง (เดาว่าเป็นการย้ายห้อง)
 * - log : Org_ChangeLog ที่ Org_Member ไม่มีเก็บ — แก้ทับแถว / ยกเลิก / ข้อมูลห้อง / ห้องลูก
 */
export async function getUnitHistory(unitId: number): Promise<UnitHistory> {
  const pool = await getPool();
  const rows = await pool
    .request()
    .input("unit", sql.Int, unitId)
    .query<OrgMemberHistRow>(`
      SELECT m.Member_ID, m.Unit_ID, m.UserID, u.UserCode, u.Name,
             m.PositionID, p.PositionCode, p.Position, p.rank_no,
             m.is_manager, m.is_primary, m.Actived,
             CONVERT(varchar(10), m.start_date, 23) AS start_date,
             CONVERT(varchar(10), m.end_date, 23)   AS end_date,
             pv.unit_code AS prev_unit, nx.unit_code AS next_unit,
             m.CreateBy, CONVERT(varchar(16), m.CreateDate, 120) AS CreateDate,
             m.UpdateBy, CONVERT(varchar(16), m.UpdateDate, 120) AS UpdateDate
      FROM dbo.Org_Member m
      JOIN dbo.Users u    ON u.UserID = m.UserID
      JOIN dbo.Position p ON p.PositionID = m.PositionID
      OUTER APPLY (SELECT TOP 1 ou.unit_code FROM dbo.Org_Member o JOIN dbo.Org_Unit ou ON ou.Unit_ID = o.Unit_ID
                   WHERE o.UserID = m.UserID AND o.Unit_ID <> m.Unit_ID AND o.Actived = 1 AND o.is_primary = m.is_primary
                     AND m.start_date IS NOT NULL AND o.end_date = DATEADD(DAY, -1, m.start_date)
                   ORDER BY o.Member_ID DESC) pv
      OUTER APPLY (SELECT TOP 1 ou.unit_code FROM dbo.Org_Member o JOIN dbo.Org_Unit ou ON ou.Unit_ID = o.Unit_ID
                   WHERE o.UserID = m.UserID AND o.Unit_ID <> m.Unit_ID AND o.Actived = 1 AND o.is_primary = m.is_primary
                     AND m.end_date IS NOT NULL AND o.start_date = DATEADD(DAY, 1, m.end_date)
                   ORDER BY o.Member_ID) nx
      WHERE m.Unit_ID = @unit
      ORDER BY m.UserID, m.start_date, m.Member_ID`);
  const log = await pool
    .request()
    .input("unit", sql.Int, unitId)
    .query<OrgLogRow>(`
      -- row_id เป็น bigint -> mssql คืนเป็น string · cast เป็น int ให้เทียบกับ Member_ID / Unit_ID ได้
      SELECT TOP 500 l.Log_ID, l.table_name, CAST(l.row_id AS int) AS row_id, l.action, l.old_json, l.new_json, l.ChangeBy,
             CONVERT(varchar(16), l.ChangeDate, 120) AS ChangeDate
      FROM dbo.Org_ChangeLog l
      WHERE (l.table_name = 'Org_Unit' AND l.row_id = @unit)
         OR (l.table_name = 'Org_Unit' AND l.action = 'I'
             AND TRY_CONVERT(int, JSON_VALUE(l.new_json, '$.parent_unit_id')) = @unit)
         OR (l.table_name = 'Org_Member' AND l.action = 'U'
             AND l.row_id IN (SELECT Member_ID FROM dbo.Org_Member WHERE Unit_ID = @unit))
      ORDER BY l.Log_ID DESC`);
  return { rows: rows.recordset, log: log.recordset };
}

/** ห้องที่คนนี้ยังไม่จบ (ปัจจุบัน + ล่วงหน้า) */
export async function getUserUnits(userId: number): Promise<UserUnitRow[]> {
  const pool = await getPool();
  const r = await pool
    .request()
    .input("uid", sql.BigInt, userId)
    .query<UserUnitRow>(`
      SELECT m.Member_ID, m.Unit_ID, un.unit_code, c.ComCode, m.is_manager, m.is_primary,
             CONVERT(varchar(10), m.start_date, 23) AS start_date,
             CONVERT(varchar(10), m.end_date, 23)   AS end_date
      FROM dbo.Org_Member m
      JOIN dbo.Org_Unit un ON un.Unit_ID = m.Unit_ID
      JOIN dbo.Company c   ON c.ComID = un.ComID
      WHERE m.UserID = @uid AND m.Actived = 1
        AND (m.end_date IS NULL OR m.end_date >= CAST(GETDATE() AS date))
      ORDER BY m.is_primary DESC, m.start_date`);
  return r.recordset;
}

/** ประเภทห้องจาก Org_UnitType — ถ้ายังไม่ได้รัน migration ใช้ค่าตั้งต้นใน rules.ts */
export async function getUnitTypes(): Promise<UnitTypeInfo[]> {
  const pool = await getPool();
  const r = await pool.request().query(`
    IF OBJECT_ID('dbo.Org_UnitType') IS NULL
      SELECT CAST(NULL AS varchar(10)) AS unit_type WHERE 1 = 0
    ELSE
      SELECT ut.unit_type, ut.level_no, ut.name_th, ut.color, ut.sort_no
      FROM dbo.Org_UnitType ut ORDER BY ut.sort_no`);
  return r.recordset.length ? r.recordset : DEFAULT_UNIT_TYPES;
}

/** UserID ของผังกลางใน Org_UnitPos */
export const DEFAULT_POS_USER = 0;

/**
 * ตำแหน่ง node ของห้องที่ยังเปิดอยู่: ของ userId ก่อน → ไม่มีก็ผังกลาง → ไม่มีก็ว่าง
 * userId = null (ไม่ login) ดูผังกลางได้ · ถ้ายังไม่ได้รัน migration 002 คืนว่าง
 */
export async function getUnitPositions(userId: number | null): Promise<{ source: PosSource; rows: UnitPos[] }> {
  const pool = await getPool();
  const r = await pool.request().input("uid", sql.BigInt, userId).input("def", sql.BigInt, DEFAULT_POS_USER).query(`
    IF OBJECT_ID('dbo.Org_UnitPos') IS NULL
      SELECT CAST(0 AS bigint) AS UserID, 0 AS Unit_ID, 0.0 AS x, 0.0 AS y WHERE 1 = 0
    ELSE
      SELECT p.UserID, p.Unit_ID, p.pos_x AS x, p.pos_y AS y
      FROM dbo.Org_UnitPos p
      JOIN dbo.Org_Unit u ON u.Unit_ID = p.Unit_ID AND u.Actived = 1
      WHERE p.UserID = ISNULL((SELECT TOP 1 UserID FROM dbo.Org_UnitPos WHERE UserID = @uid), @def)`);
  const rows = r.recordset as (UnitPos & { UserID: number | string })[];
  if (!rows.length) return { source: "none", rows: [] };
  return {
    source: Number(rows[0].UserID) === DEFAULT_POS_USER ? "default" : "mine",
    rows: rows.map(({ Unit_ID, x, y }) => ({ Unit_ID, x, y })),
  };
}

export async function getLookups(): Promise<OrgLookups> {
  const pool = await getPool();
  const [com, pos, usr] = await Promise.all([
    pool.request().query(`SELECT ComID, ComCode, ComName FROM dbo.Company ORDER BY ComID`),
    pool.request().query(`SELECT PositionID, PositionCode, Position, ComID FROM dbo.Position WHERE is_active = 1 ORDER BY ISNULL(rank_no, 0) DESC, PositionCode`),
    pool.request().query(`SELECT UserID, UserCode, Name FROM dbo.Users WHERE ISNULL(Actived, 1) = 1 ORDER BY UserCode`),
  ]);
  return {
    companies: com.recordset,
    positions: pos.recordset.map((p) => ({
      value: String(p.PositionID),
      code: p.PositionCode ?? "",
      label: [p.PositionCode, p.Position].filter(Boolean).join(" - "),
      comId: p.ComID ?? null,
    })),
    unitTypes: await getUnitTypes(),
    users: usr.recordset.map((u) => ({ value: String(u.UserID), label: `${u.Name ?? ""} (${u.UserCode})` })),
  };
}
