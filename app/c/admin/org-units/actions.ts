"use server";

import { getCurrentUser } from "@/lib/auth";
import { getPool, sql } from "@/lib/db";
import { DEFAULT_POS_USER, getUnitHistory, getUnitTypes, getUnits, getUserUnits } from "@/lib/org/queries";
import type { ActionResult, OrgUnitRow, UnitHistory, UnitPos, UserUnitRow } from "@/lib/org/types";

// ทุก action เรียกได้ผ่าน POST ตรง ๆ — ตรวจ input ฝั่ง server เสมอ
// ยังไม่มีระบบ login: by = NULL -> ใช้ SUSER_SNAME() ใน SQL (ส่ง by มาได้เมื่อมี auth)

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

class UserError extends Error {}

function int(v: unknown, name: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new UserError(`ค่า ${name} ไม่ถูกต้อง`);
  return n;
}
function optInt(v: unknown, name: string): number | null {
  return v === null || v === undefined || v === "" ? null : int(v, name);
}
function date(v: unknown, name = "วันที่"): string {
  if (typeof v !== "string" || !DATE_RE.test(v) || Number.isNaN(Date.parse(v))) throw new UserError(`${name} ไม่ถูกต้อง`);
  return v;
}
function optDate(v: unknown, name: string): string | null {
  return v === null || v === undefined || v === "" ? null : date(v, name);
}
function text(v: unknown, name: string, max: number, required = true): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) {
    if (required) throw new UserError(`กรุณากรอก ${name}`);
    return null;
  }
  if (s.length > max) throw new UserError(`${name} ยาวเกิน ${max} ตัวอักษร`);
  return s;
}
function byOf(by: unknown): string | null {
  return typeof by === "string" && by.trim() ? by.trim().slice(0, 50) : null;
}

// ข้อความจาก RAISERROR / trigger -> ข้อความที่ผู้ใช้อ่านเข้าใจ
function friendly(err: unknown): string {
  if (err instanceof UserError) return err.message;
  const e = err as { message?: string; precedingErrors?: { message?: string }[]; originalError?: { info?: { message?: string } } };
  const msgs = [
    ...(e.precedingErrors ?? []).map((p) => p.message),
    e.originalError?.info?.message,
    e.message,
  ].filter((m): m is string => Boolean(m) && !/transaction ended in the trigger/i.test(m!));
  let msg = msgs.find((m) => /Org_|usp_/.test(m)) ?? msgs[0] ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง";
  msg = msg.replace(/^(Org_Member|Org_Unit|usp_Org_\w+):\s*/, "");
  if (msg.includes("ห้องนี้มีหัวหน้าอยู่แล้ว")) msg = "ห้องนี้มีหัวหน้าอยู่แล้วในช่วงวันที่เดียวกัน — ถอดหัวหน้าคนเดิมก่อน";
  if (/UQ_Org_Unit_code/.test(msg)) msg = "รหัสห้องนี้มีอยู่แล้วในบริษัทนี้";
  if (/CK_Org_Member_dates/.test(msg)) msg = "วันที่จบต้องไม่ก่อนวันที่เริ่ม";
  if (/CK_Org_Unit_root/.test(msg)) msg = "ห้องระดับบริษัทต้องไม่มีห้องแม่ และห้องอื่นต้องมีห้องแม่";
  if (/CK_Org_Unit_parent/.test(msg)) msg = "ห้องแม่เป็นตัวเองไม่ได้";
  if (/CK_Org_Unit_type/.test(msg)) msg = "ประเภทห้องไม่ถูกต้อง";
  if (/FK_Org_UnitPos_Unit/.test(msg)) msg = "ไม่พบห้อง — รีเฟรชหน้าแล้วลองใหม่";
  if (/Invalid object name 'dbo\.Org_UnitPos'/.test(msg)) msg = "ยังไม่ได้สร้างตาราง Org_UnitPos — รัน db/002_org_unit_pos.sql ก่อน";
  console.error("[org-units]", err);
  return msg;
}

async function run<T>(fn: () => Promise<T | { data: T; note?: string | null }>): Promise<ActionResult<T>> {
  try {
    const r = await fn();
    if (r && typeof r === "object" && "data" in (r as object) && "note" in (r as object)) {
      const x = r as { data: T; note?: string | null };
      return { ok: true, data: x.data, note: x.note ?? null };
    }
    return { ok: true, data: r as T };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

async function tx<T>(fn: (t: sql.Transaction) => Promise<T>): Promise<T> {
  const pool = await getPool();
  const t = new sql.Transaction(pool);
  await t.begin();
  try {
    const r = await fn(t);
    await t.commit();
    return r;
  } catch (err) {
    // trigger อาจ rollback ไปแล้ว — rollback ซ้ำจะ throw ให้กลืนไว้
    await t.rollback().catch(() => {});
    throw err;
  }
}

// ---------------------------------------------------------------- reads

export async function refreshUnits(): Promise<ActionResult<OrgUnitRow[]>> {
  return run(() => getUnits());
}

export async function loadUnitHistory(unitId: number): Promise<ActionResult<UnitHistory>> {
  return run(() => getUnitHistory(int(unitId, "Unit_ID")));
}

export async function loadUserUnits(userId: number): Promise<ActionResult<UserUnitRow[]>> {
  return run(() => getUserUnits(int(userId, "UserID")));
}

// ---------------------------------------------------------------- Org_Unit

export async function setParent(input: { unitId: number; parentId: number; by?: string }): Promise<ActionResult<OrgUnitRow[]>> {
  return run(async () => {
    const unitId = int(input.unitId, "Unit_ID");
    const parentId = int(input.parentId, "ห้องแม่");
    if (unitId === parentId) throw new UserError("ห้องแม่เป็นตัวเองไม่ได้");
    const pool = await getPool();
    const chk = await pool.request().input("u", sql.Int, unitId).input("p", sql.Int, parentId).query(`
      SELECT (SELECT unit_type FROM dbo.Org_Unit WHERE Unit_ID = @u AND Actived = 1) AS t,
             (SELECT ComID FROM dbo.Org_Unit WHERE Unit_ID = @u) AS cu,
             (SELECT ComID FROM dbo.Org_Unit WHERE Unit_ID = @p AND Actived = 1) AS cp`);
    const c = chk.recordset[0];
    if (!c.t || !c.cp) throw new UserError("ไม่พบห้อง (หรือถูกปิดแล้ว)");
    if (c.t === "COMPANY") throw new UserError("ห้องระดับบริษัทไม่มีห้องแม่");
    if (c.cu !== c.cp) throw new UserError("ห้องแม่ต้องอยู่บริษัทเดียวกัน");
    await pool.request().input("u", sql.Int, unitId).input("p", sql.Int, parentId).input("by", sql.VarChar(50), byOf(input.by)).query(`
      UPDATE dbo.Org_Unit SET parent_unit_id = @p, UpdateBy = ISNULL(@by, LEFT(SUSER_SNAME(), 50)), UpdateDate = GETDATE()
      WHERE Unit_ID = @u`);
    return getUnits();
  });
}

type UnitInput = { unit_name?: string; unit_type?: string; by?: string };

async function unitType(v: unknown): Promise<string> {
  const types = await getUnitTypes();
  if (typeof v !== "string" || v === "COMPANY" || !types.some((t) => t.unit_type === v)) throw new UserError("ประเภทห้องไม่ถูกต้อง");
  return v;
}

/** ห้องระดับบริษัท (ราก) — 1 บริษัทมีได้ 1 ห้อง */
export async function createCompanyUnit(input: { comId: number; unit_code: string; unit_name?: string; by?: string }): Promise<ActionResult<OrgUnitRow[]>> {
  return run(async () => {
    const comId = int(input.comId, "บริษัท");
    const code = text(input.unit_code, "รหัสห้อง", 40)!;
    const name = text(input.unit_name, "ชื่อห้อง", 150, false);
    const pool = await getPool();
    const c = await pool.request().input("c", sql.Int, comId).input("code", sql.VarChar(40), code).query(`
      SELECT (SELECT COUNT(*) FROM dbo.Company WHERE ComID = @c) AS com,
             (SELECT COUNT(*) FROM dbo.Org_Unit WHERE ComID = @c AND unit_type = 'COMPANY' AND Actived = 1) AS roots,
             (SELECT COUNT(*) FROM dbo.Org_Unit WHERE ComID = @c AND unit_code = @code AND Actived = 1) AS dup`);
    const r = c.recordset[0];
    if (!r.com) throw new UserError("ไม่พบบริษัท");
    if (r.roots) throw new UserError("บริษัทนี้มีห้องระดับบริษัทอยู่แล้ว");
    if (r.dup) throw new UserError(`รหัสห้อง ${code} ถูกใช้กับห้องอื่นที่เปิดอยู่ในบริษัทนี้แล้ว`);
    await pool.request()
      .input("c", sql.Int, comId).input("code", sql.VarChar(40), code).input("name", sql.NVarChar(150), name)
      .input("by", sql.VarChar(50), byOf(input.by))
      .query(`INSERT dbo.Org_Unit (ComID, unit_code, unit_type, unit_name, parent_unit_id, Actived, CreateBy)
              VALUES (@c, @code, 'COMPANY', @name, NULL, 1, ISNULL(@by, LEFT(SUSER_SNAME(), 50)))`);
    return getUnits();
  });
}

export async function createUnit(input: UnitInput & { parentId: number; unit_code: string }): Promise<ActionResult<OrgUnitRow[]>> {
  return run(async () => {
    const parentId = int(input.parentId, "ห้องแม่");
    const code = text(input.unit_code, "รหัสห้อง", 40)!;
    const name = text(input.unit_name, "ชื่อห้อง", 150, false);
    const type = await unitType(input.unit_type);
    const pool = await getPool();
    const p = await pool.request().input("p", sql.Int, parentId).query(`SELECT ComID FROM dbo.Org_Unit WHERE Unit_ID = @p AND Actived = 1`);
    if (!p.recordset.length) throw new UserError("ไม่พบห้องแม่ (หรือถูกปิดแล้ว)");
    const comId = p.recordset[0].ComID as number;
    const dup = await pool.request().input("c", sql.Int, comId).input("code", sql.VarChar(40), code)
      .query(`SELECT 1 FROM dbo.Org_Unit WHERE ComID = @c AND unit_code = @code AND Actived = 1`);
    if (dup.recordset.length) throw new UserError(`รหัสห้อง ${code} ถูกใช้กับห้องอื่นที่เปิดอยู่ในบริษัทนี้แล้ว`);
    await pool.request()
      .input("c", sql.Int, comId).input("code", sql.VarChar(40), code).input("type", sql.VarChar(10), type)
      .input("name", sql.NVarChar(150), name).input("p", sql.Int, parentId)
      .input("by", sql.VarChar(50), byOf(input.by))
      .query(`INSERT dbo.Org_Unit (ComID, unit_code, unit_type, unit_name, parent_unit_id, Actived, CreateBy)
              VALUES (@c, @code, @type, @name, @p, 1, ISNULL(@by, LEFT(SUSER_SNAME(), 50)))`);
    return getUnits();
  });
}

export async function updateUnit(input: UnitInput & { unitId: number; unit_code: string }): Promise<ActionResult<OrgUnitRow[]>> {
  return run(async () => {
    const unitId = int(input.unitId, "Unit_ID");
    const code = text(input.unit_code, "รหัสห้อง", 40)!;
    const name = text(input.unit_name, "ชื่อห้อง", 150, false);
    const pool = await getPool();
    const cur = await pool.request().input("u", sql.Int, unitId).query(`SELECT unit_type, ComID FROM dbo.Org_Unit WHERE Unit_ID = @u AND Actived = 1`);
    if (!cur.recordset.length) throw new UserError("ไม่พบห้อง (หรือถูกปิดแล้ว)");
    const dup = await pool.request().input("c", sql.Int, cur.recordset[0].ComID).input("code", sql.VarChar(40), code).input("u", sql.Int, unitId)
      .query(`SELECT 1 FROM dbo.Org_Unit WHERE ComID = @c AND unit_code = @code AND Unit_ID <> @u AND Actived = 1`);
    if (dup.recordset.length) throw new UserError(`รหัสห้อง ${code} ถูกใช้กับห้องอื่นที่เปิดอยู่ในบริษัทนี้แล้ว`);
    // ห้องบริษัทเปลี่ยนประเภทไม่ได้ และห้องอื่นเปลี่ยนเป็นบริษัทไม่ได้
    const type = cur.recordset[0].unit_type === "COMPANY" ? "COMPANY" : await unitType(input.unit_type);
    await pool.request()
      .input("u", sql.Int, unitId).input("code", sql.VarChar(40), code).input("type", sql.VarChar(10), type).input("name", sql.NVarChar(150), name)
      .input("by", sql.VarChar(50), byOf(input.by))
      .query(`UPDATE dbo.Org_Unit SET unit_code = @code, unit_type = @type, unit_name = @name,
                     UpdateBy = ISNULL(@by, LEFT(SUSER_SNAME(), 50)), UpdateDate = GETDATE()
              WHERE Unit_ID = @u`);
    return getUnits();
  });
}

export async function deactivateUnit(input: { unitId: number; by?: string }): Promise<ActionResult<OrgUnitRow[]>> {
  return run(async () => {
    const unitId = int(input.unitId, "Unit_ID");
    const pool = await getPool();
    const c = await pool.request().input("u", sql.Int, unitId).query(`
      SELECT (SELECT COUNT(*) FROM dbo.Org_Member WHERE Unit_ID = @u AND Actived = 1
                AND (end_date IS NULL OR end_date >= CAST(GETDATE() AS date))) AS members,
             (SELECT COUNT(*) FROM dbo.Org_Unit WHERE parent_unit_id = @u AND Actived = 1) AS children,
             (SELECT unit_type FROM dbo.Org_Unit WHERE Unit_ID = @u) AS t`);
    const r = c.recordset[0];
    if (r.t === "COMPANY") throw new UserError("ปิดห้องระดับบริษัทไม่ได้");
    if (r.members > 0) throw new UserError(`ยังมีคนในห้องนี้ ${r.members} รายการ (รวมที่ตั้งไว้ล่วงหน้า) — ย้ายหรือให้ออกก่อน`);
    if (r.children > 0) throw new UserError(`ยังมีห้องลูก ${r.children} ห้อง — ย้ายห้องลูกก่อน`);
    await pool.request().input("u", sql.Int, unitId).input("by", sql.VarChar(50), byOf(input.by)).query(`
      UPDATE dbo.Org_Unit SET Actived = 0, UpdateBy = ISNULL(@by, LEFT(SUSER_SNAME(), 50)), UpdateDate = GETDATE()
      WHERE Unit_ID = @u`);
    return getUnits();
  });
}

/** เปิดห้องที่ปิดไปกลับมา (เลิกทำการปิดห้อง) — ห้องแม่ต้องยังเปิดอยู่ และรหัสห้องต้องไม่ซ้ำกับห้องที่เปิดอยู่ */
export async function reactivateUnit(input: { unitId: number; by?: string }): Promise<ActionResult<OrgUnitRow[]>> {
  return run(async () => {
    const unitId = int(input.unitId, "Unit_ID");
    const pool = await getPool();
    const c = await pool.request().input("u", sql.Int, unitId).query(`
      SELECT u.Actived, u.unit_code, u.parent_unit_id,
             p.Actived AS parent_active, p.unit_code AS parent_code,
             (SELECT COUNT(*) FROM dbo.Org_Unit d
               WHERE d.ComID = u.ComID AND d.unit_code = u.unit_code AND d.Unit_ID <> u.Unit_ID AND d.Actived = 1) AS dup
      FROM dbo.Org_Unit u
      LEFT JOIN dbo.Org_Unit p ON p.Unit_ID = u.parent_unit_id
      WHERE u.Unit_ID = @u`);
    const r = c.recordset[0];
    if (!r) throw new UserError("ไม่พบห้อง");
    if (r.Actived) throw new UserError(`ห้อง ${r.unit_code} เปิดอยู่แล้ว`);
    if (r.parent_unit_id != null && !r.parent_active)
      throw new UserError(`ห้องแม่ ${r.parent_code ?? ""} ถูกปิดไปแล้ว — เปิดห้อง ${r.unit_code} กลับไม่ได้`);
    if (r.dup > 0) throw new UserError(`รหัสห้อง ${r.unit_code} ถูกใช้กับห้องอื่นที่เปิดอยู่แล้ว`);
    await pool.request().input("u", sql.Int, unitId).input("by", sql.VarChar(50), byOf(input.by)).query(`
      UPDATE dbo.Org_Unit SET Actived = 1, UpdateBy = ISNULL(@by, LEFT(SUSER_SNAME(), 50)), UpdateDate = GETDATE()
      WHERE Unit_ID = @u AND Actived = 0`);
    return getUnits();
  });
}

// ---------------------------------------------------------------- Org_UnitPos (ตำแหน่ง node)
// UserID มาจาก getCurrentUser() ฝั่ง server เท่านั้น — ไม่รับจาก client · ไม่ login = บันทึกไม่ได้

const MAX_POS_ROWS = 5000;
const POS_CHUNK = 500; // 3 parameter ต่อแถว — อยู่ใต้ลิมิต 2100 parameter ของ SQL Server

function coord(v: unknown, name: string): number {
  const n = Number(v);
  if (!Number.isFinite(n) || Math.abs(n) > 1e7) throw new UserError(`ค่า ${name} ไม่ถูกต้อง`);
  return Math.round(n * 100) / 100;
}

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new UserError("ยังไม่ได้ login — ไม่ได้บันทึกตำแหน่ง");
  return user;
}

/** บันทึก / อัปเดตตำแหน่งของผังตัวเอง (upsert เฉพาะแถวที่ส่งมา) */
export async function saveUnitPositions(input: { rows: UnitPos[] }): Promise<ActionResult<null>> {
  return run(async () => {
    const user = await requireUser();
    if (!Array.isArray(input?.rows) || input.rows.length > MAX_POS_ROWS) throw new UserError("ข้อมูลตำแหน่งไม่ถูกต้อง");
    // id ซ้ำ -> ใช้ค่าหลังสุด (MERGE ห้ามมีแถวต้นทางซ้ำ)
    const byUnit = new Map<number, { id: number; x: number; y: number }>();
    input.rows.forEach((r) => {
      const id = int(r?.Unit_ID, "Unit_ID");
      byUnit.set(id, { id, x: coord(r?.x, "x"), y: coord(r?.y, "y") });
    });
    const rows = [...byUnit.values()];
    if (!rows.length) return null;
    await tx(async (t) => {
      for (let i = 0; i < rows.length; i += POS_CHUNK) {
        const chunk = rows.slice(i, i + POS_CHUNK);
        const req = new sql.Request(t).input("uid", sql.BigInt, user.UserID);
        const values = chunk.map((r, j) => {
          req.input(`u${j}`, sql.Int, r.id).input(`x${j}`, sql.Float, r.x).input(`y${j}`, sql.Float, r.y);
          return `(@u${j}, @x${j}, @y${j})`;
        });
        await req.query(`
          MERGE dbo.Org_UnitPos AS t
          USING (VALUES ${values.join(", ")}) AS s (Unit_ID, pos_x, pos_y)
          ON t.UserID = @uid AND t.Unit_ID = s.Unit_ID
          WHEN MATCHED THEN UPDATE SET pos_x = s.pos_x, pos_y = s.pos_y, UpdateDate = GETDATE()
          WHEN NOT MATCHED THEN INSERT (UserID, Unit_ID, pos_x, pos_y) VALUES (@uid, s.Unit_ID, s.pos_x, s.pos_y);`);
      }
    });
    return null;
  });
}

/** ตั้งผังของตัวเองเป็นผังกลาง (UserID 0) — แทนที่ผังกลางเดิมทั้งชุด */
export async function publishDefaultLayout(): Promise<ActionResult<null>> {
  return run(async () => {
    const user = await requireUser();
    await tx(async (t) => {
      const r = await new sql.Request(t).input("uid", sql.BigInt, user.UserID).input("def", sql.BigInt, DEFAULT_POS_USER).query(`
        DELETE dbo.Org_UnitPos WHERE UserID = @def;
        INSERT dbo.Org_UnitPos (UserID, Unit_ID, pos_x, pos_y)
        SELECT @def, Unit_ID, pos_x, pos_y FROM dbo.Org_UnitPos WHERE UserID = @uid;`);
      if (!r.rowsAffected.at(-1)) throw new UserError("ยังไม่มีผังของคุณ — ลากหรือจัดเรียงใหม่ก่อน");
    });
    return null;
  });
}

// ---------------------------------------------------------------- Org_Member
// ทุก action ของสมาชิกคืน units ใหม่ (จำนวนคน / หัวหน้าบน node เปลี่ยน) — dialog โหลดรายชื่อใหม่เอง

export async function addMember(input: {
  unitId: number; userId: number; positionId: number; isManager: boolean; date: string; endDate?: string | null; by?: string;
}): Promise<ActionResult<OrgUnitRow[]>> {
  return run(async () => {
    const unitId = int(input.unitId, "Unit_ID");
    const userId = int(input.userId, "ผู้ใช้");
    const positionId = int(input.positionId, "ตำแหน่ง");
    const d = date(input.date);
    const end = optDate(input.endDate, "วันที่จบ");
    if (end && end < d) throw new UserError("วันที่จบต้องไม่ก่อนวันที่เริ่ม");
    let note: string | null = null;
    await tx(async (t) => {
      // ไม่มีห้องหลักที่ทับช่วง [d, end] -> ห้องนี้เป็นห้องหลัก
      const p = await new sql.Request(t).input("uid", sql.BigInt, userId)
        .input("d", sql.VarChar(10), d).input("end", sql.VarChar(10), end).query(`
        SELECT COUNT(*) AS n FROM dbo.Org_Member
        WHERE UserID = @uid AND Actived = 1 AND is_primary = 1
          AND (end_date IS NULL OR end_date >= CAST(@d AS date))
          AND (@end IS NULL OR start_date IS NULL OR start_date <= CAST(@end AS date))`);
      const isPrimary = p.recordset[0].n === 0;
      const notes: string[] = [];
      if (isPrimary) notes.push("ตั้งเป็นห้องหลักให้อัตโนมัติ (ช่วงนี้ยังไม่มีห้องหลัก)");
      const req = () => new sql.Request(t)
        .input("unit", sql.Int, unitId).input("uid", sql.BigInt, userId).input("pos", sql.Int, positionId)
        .input("mgr", sql.Bit, Boolean(input.isManager)).input("pri", sql.Bit, isPrimary)
        .input("d", sql.VarChar(10), d).input("end", sql.VarChar(10), end).input("by", sql.VarChar(50), byOf(input.by));

      // แถวเดิม (ห้อง / ตำแหน่ง / หัวหน้า / ห้องหลักเหมือนกัน) ที่ช่วงวันที่ต่อกันพอดี
      //   prev: จบวันที่ d-1 · next: เริ่มวันที่ end+1  -> ขยายแถวเดิมแทนการเพิ่มแถวใหม่
      const adj = await req().query(`
        SELECT Member_ID, CONVERT(varchar(10), end_date, 23) AS end_date,
               CASE WHEN end_date = DATEADD(DAY, -1, CAST(@d AS date)) THEN 'prev' ELSE 'next' END AS side
        FROM dbo.Org_Member WITH (UPDLOCK)
        WHERE UserID = @uid AND Unit_ID = @unit AND Actived = 1
          AND PositionID = @pos AND is_manager = @mgr AND is_primary = @pri
          AND (   end_date = DATEADD(DAY, -1, CAST(@d AS date))
               OR (@end IS NOT NULL AND start_date = DATEADD(DAY, 1, CAST(@end AS date))))`);
      const rows = adj.recordset as { Member_ID: number; end_date: string | null; side: "prev" | "next" }[];
      const prev = rows.find((r) => r.side === "prev");
      const next = rows.find((r) => r.side === "next");
      const upd = `UpdateBy = ISNULL(@by, LEFT(SUSER_SNAME(), 50)), UpdateDate = GETDATE()`;

      if (prev && next) {
        // เติมช่องว่างพอดี -> รวม 3 ช่วงเป็นแถวเดียว (แถวหลังถูกรวมเข้าแถวแรก)
        // ปิดแถวหลังก่อน แล้วค่อยขยายแถวแรก — trigger ห้ามคนเดียวกันอยู่ห้องเดียวกันซ้อนวัน
        await req().input("p", sql.Int, prev.Member_ID).input("n", sql.Int, next.Member_ID)
          .input("nEnd", sql.VarChar(10), next.end_date).query(`
          UPDATE dbo.Org_Member SET Actived = 0, ${upd} WHERE Member_ID = @n;
          UPDATE dbo.Org_Member SET end_date = CAST(@nEnd AS date), ${upd} WHERE Member_ID = @p;`);
        notes.push("ช่วงวันที่ต่อกับรายการเดิมทั้งก่อนและหลัง — รวมเป็นรายการเดียว");
      } else if (prev) {
        await req().input("p", sql.Int, prev.Member_ID)
          .query(`UPDATE dbo.Org_Member SET end_date = CAST(@end AS date), ${upd} WHERE Member_ID = @p`);
        notes.push("ช่วงวันที่ต่อกับรายการเดิม — ขยายวันจบของรายการเดิมแทนการเพิ่มใหม่");
      } else if (next) {
        await req().input("n", sql.Int, next.Member_ID)
          .query(`UPDATE dbo.Org_Member SET start_date = CAST(@d AS date), ${upd} WHERE Member_ID = @n`);
        notes.push("ช่วงวันที่ต่อกับรายการเดิม — เลื่อนวันเริ่มของรายการเดิมแทนการเพิ่มใหม่");
      } else {
        await req().query(`INSERT dbo.Org_Member (Unit_ID, UserID, PositionID, is_manager, is_primary, start_date, end_date, Actived, CreateBy)
                VALUES (@unit, @uid, @pos, @mgr, @pri, CAST(@d AS date), CAST(@end AS date), 1, ISNULL(@by, LEFT(SUSER_SNAME(), 50)))`);
      }
      note = notes.length ? notes.join(" · ") : null;
    });
    return { data: await getUnits(), note };
  });
}

export async function moveMember(input: {
  memberId: number; toUnitId: number; positionId?: number | null; isManager: boolean; date: string; by?: string;
}): Promise<ActionResult<OrgUnitRow[]>> {
  return run(async () => {
    const pool = await getPool();
    const r = await pool.request()
      .input("member_id", sql.Int, int(input.memberId, "Member_ID"))
      .input("to_unit_id", sql.Int, int(input.toUnitId, "ห้องปลายทาง"))
      .input("effective_date", sql.Date, new Date(`${date(input.date)}T00:00:00Z`))
      .input("position_id", sql.Int, optInt(input.positionId, "ตำแหน่ง"))
      .input("is_manager", sql.Bit, Boolean(input.isManager))
      .input("by", sql.VarChar(50), byOf(input.by))
      .execute("dbo.usp_Org_MoveMember");
    const rows = (r.recordset ?? []) as { note?: string | null }[];
    const note = rows.find((x) => x.note)?.note ?? null;
    return { data: await getUnits(), note };
  });
}

export async function setPrimary(input: { memberId: number; date: string; by?: string }): Promise<ActionResult<OrgUnitRow[]>> {
  return run(async () => {
    const pool = await getPool();
    await pool.request()
      .input("member_id", sql.Int, int(input.memberId, "Member_ID"))
      .input("effective_date", sql.Date, new Date(`${date(input.date)}T00:00:00Z`))
      .input("by", sql.VarChar(50), byOf(input.by))
      .execute("dbo.usp_Org_SetPrimary");
    return getUnits();
  });
}

/**
 * ตั้ง / ถอดหัวหน้า 1 แถวภายใน transaction ช่วง [d, until] (until = null -> ถึงวันจบเดิมของแถว)
 * แบ่งแถวเดิมเป็นสูงสุด 3 ชิ้น (ทุกชิ้นได้ตำแหน่ง / ห้องหลักเดิม):
 *   A [start, d-1]       สถานะหัวหน้าเดิม  (ถ้าแถวเริ่มก่อน d) — ใช้แถวเดิม
 *   B [d, until]         สถานะใหม่
 *   C [until+1, end]     กลับเป็นสถานะเดิม (ถ้า until จบก่อนแถวเดิม)
 */
async function applyManager(t: sql.Transaction, memberId: number, isManager: boolean, d: string, by: string | null, until: string | null = null) {
  const cur = await new sql.Request(t).input("m", sql.Int, memberId).query(`
    SELECT m.Unit_ID, m.is_manager, m.Actived, un.unit_code,
           CONVERT(varchar(10), m.start_date, 23) AS start_date,
           CONVERT(varchar(10), m.end_date, 23) AS end_date
    FROM dbo.Org_Member m WITH (UPDLOCK)
    JOIN dbo.Org_Unit un ON un.Unit_ID = m.Unit_ID
    WHERE m.Member_ID = @m`);
  const row = cur.recordset[0] as {
    Unit_ID: number; is_manager: boolean; Actived: boolean; unit_code: string; start_date: string | null; end_date: string | null;
  } | undefined;
  if (!row || !row.Actived) throw new UserError("ไม่พบรายการนี้ (หรือถูกยกเลิกแล้ว)");
  if ((row.start_date && row.start_date > d) || (row.end_date && row.end_date < d))
    throw new UserError("วันที่มีผลไม่อยู่ในช่วงวันที่ของรายการนี้");
  if (Boolean(row.is_manager) === isManager)
    throw new UserError(isManager ? "คนนี้เป็นหัวหน้าห้องนี้อยู่แล้ว" : "คนนี้ไม่ได้เป็นหัวหน้าห้องนี้");
  if (until && until < d) throw new UserError("\"ถึงวันที่\" ต้องไม่ก่อนวันที่มีผล");
  if (until && row.end_date && until > row.end_date)
    throw new UserError(`"ถึงวันที่" เกินช่วงที่คนนี้อยู่ห้อง (จบ ${row.end_date})`);

  const hasA = !row.start_date || row.start_date < d;
  const hasC = Boolean(until) && (!row.end_date || until! < row.end_date);
  const bEnd = hasC ? until : row.end_date;

  // แถวข้างเคียงของคนนี้ในห้องนี้ (ตำแหน่ง / ห้องหลักเดิม) ที่มีสถานะหัวหน้า "ใหม่" และต่อกับชิ้น B พอดี
  //   P: จบวันก่อน d พอดี (มีได้เฉพาะเมื่อ B เริ่มที่ต้นแถว = !hasA)
  //   N: เริ่มวันถัดจากปลาย B พอดี (มีได้เฉพาะเมื่อ B จบที่ปลายแถว = !hasC)
  // -> ต่อช่วงของแถวข้างเคียงแทนการเพิ่ม / แยกแถวใหม่
  const adj = await new sql.Request(t)
    .input("m", sql.Int, memberId).input("mgr", sql.Bit, isManager)
    .input("d", sql.VarChar(10), d).input("bEnd", sql.VarChar(10), bEnd)
    .input("wantP", sql.Bit, !hasA).input("wantN", sql.Bit, !hasC && Boolean(bEnd)).query(`
    SELECT o.Member_ID, CONVERT(varchar(10), o.end_date, 23) AS end_date,
           CASE WHEN o.end_date = DATEADD(DAY, -1, CAST(@d AS date)) THEN 'P' ELSE 'N' END AS side
    FROM dbo.Org_Member m
    JOIN dbo.Org_Member o WITH (UPDLOCK)
      ON o.UserID = m.UserID AND o.Unit_ID = m.Unit_ID AND o.PositionID = m.PositionID AND o.is_primary = m.is_primary
     AND o.Member_ID <> m.Member_ID AND o.Actived = 1 AND o.is_manager = @mgr
    WHERE m.Member_ID = @m
      AND (   (@wantP = 1 AND o.end_date = DATEADD(DAY, -1, CAST(@d AS date)))
           OR (@wantN = 1 AND o.start_date = DATEADD(DAY, 1, CAST(@bEnd AS date))))`);
  const sides = adj.recordset as { Member_ID: number; end_date: string | null; side: "P" | "N" }[];
  const P = sides.find((x) => x.side === "P") ?? null;
  const N = sides.find((x) => x.side === "N") ?? null;

  const req = () => new sql.Request(t)
    .input("m", sql.Int, memberId).input("mgr", sql.Bit, isManager).input("old", sql.Bit, Boolean(row.is_manager))
    .input("d", sql.VarChar(10), d).input("bEnd", sql.VarChar(10), bEnd).input("until", sql.VarChar(10), until)
    .input("end", sql.VarChar(10), row.end_date).input("by", sql.VarChar(50), by)
    .input("p", sql.Int, P?.Member_ID ?? null).input("n", sql.Int, N?.Member_ID ?? null)
    .input("nEnd", sql.VarChar(10), N?.end_date ?? null);
  const upd = `UpdateBy = ISNULL(@by, LEFT(SUSER_SNAME(), 50)), UpdateDate = GETDATE()`;
  const ins = (mgr: string, s: string, e: string) => `
      INSERT dbo.Org_Member (Unit_ID, UserID, PositionID, is_manager, is_primary, start_date, end_date, Actived, CreateBy)
      SELECT Unit_ID, UserID, PositionID, ${mgr}, is_primary, ${s}, ${e}, 1, ISNULL(@by, LEFT(SUSER_SNAME(), 50))
      FROM dbo.Org_Member WHERE Member_ID = @m;`;
  // ปลายช่วงสถานะใหม่หลังต่อกับ N (null = ไม่มีวันจบ)
  const tail = N ? "CAST(@nEnd AS date)" : "CAST(@bEnd AS date)";

  // ลำดับสำคัญ: หด / ปิดแถวก่อนแล้วค่อยขยาย / เพิ่ม — trigger ห้ามคนเดียวกันอยู่ห้องเดียวกันซ้อนวัน
  let q: string;
  if (hasA) {
    // A = แถวเดิม · B ต่อเข้า N ถ้ามี ไม่อย่างนั้นเพิ่มแถวใหม่ · C เพิ่มแถวใหม่
    q = `UPDATE dbo.Org_Member SET end_date = DATEADD(DAY, -1, CAST(@d AS date)), ${upd} WHERE Member_ID = @m;
         ${N ? `UPDATE dbo.Org_Member SET start_date = CAST(@d AS date), ${upd} WHERE Member_ID = @n;`
             : ins("@mgr", "CAST(@d AS date)", "CAST(@bEnd AS date)")}
         ${hasC ? ins("@old", "DATEADD(DAY, 1, CAST(@until AS date))", "CAST(@end AS date)") : ""}`;
  } else if (P && hasC) {
    // B ต่อท้าย P · แถวเดิมกลายเป็น C (เลื่อนวันเริ่ม) — ไม่มีแถวใหม่
    q = `UPDATE dbo.Org_Member SET start_date = DATEADD(DAY, 1, CAST(@until AS date)), ${upd} WHERE Member_ID = @m;
         UPDATE dbo.Org_Member SET end_date = CAST(@until AS date), ${upd} WHERE Member_ID = @p;`;
  } else if (P) {
    // ทั้งแถวเดิม (และ N ถ้ามี) รวมเข้า P
    q = `UPDATE dbo.Org_Member SET Actived = 0, ${upd} WHERE Member_ID = @m;
         ${N ? `UPDATE dbo.Org_Member SET Actived = 0, ${upd} WHERE Member_ID = @n;` : ""}
         UPDATE dbo.Org_Member SET end_date = ${tail}, ${upd} WHERE Member_ID = @p;`;
  } else {
    // แถวเดิม = B (รวม N เข้ามาถ้ามี) · C เพิ่มแถวใหม่
    q = `${N ? `UPDATE dbo.Org_Member SET Actived = 0, ${upd} WHERE Member_ID = @n;` : ""}
         UPDATE dbo.Org_Member SET is_manager = @mgr, end_date = ${tail}, ${upd} WHERE Member_ID = @m;
         ${hasC ? ins("@old", "DATEADD(DAY, 1, CAST(@until AS date))", "CAST(@end AS date)") : ""}`;
  }
  await req().query(q);
  return row;
}

export async function setManager(input: {
  memberId: number; isManager: boolean; date: string; until?: string | null; by?: string;
}): Promise<ActionResult<OrgUnitRow[]>> {
  return run(async () => {
    const memberId = int(input.memberId, "Member_ID");
    const isManager = Boolean(input.isManager);
    const d = date(input.date);
    const until = optDate(input.until, "ถึงวันที่");
    let note: string | null = null;
    await tx(async (t) => {
      const row = await applyManager(t, memberId, isManager, d, byOf(input.by), until);
      if (!isManager)
        note = `ห้อง ${row.unit_code} จะไม่มีหัวหน้าตั้งแต่ ${d}${until ? ` ถึง ${until}` : ""} (สายอนุมัติจะขึ้นไปห้องแม่)`;
    });
    return { data: await getUnits(), note };
  });
}

/**
 * เปลี่ยนหัวหน้า — transaction เดียว ไม่มีช่วงว่าง/ซ้อน
 * - ไม่ส่ง until (ลากวางวันนี้): ถอดหัวหน้าที่คลุมวันที่ d แล้วตั้งคนใหม่ตั้งแต่ d
 * - ส่ง until (ฟอร์มเลือกช่วง, null = ถึงวันจบของแถว): ถอดหัวหน้าทุกคนเฉพาะส่วนที่ทับช่วง [d, until] แล้วตั้งคนใหม่ช่วงนั้น
 */
export async function replaceManager(input: {
  memberId: number; date: string; until?: string | null; by?: string;
}): Promise<ActionResult<OrgUnitRow[]>> {
  return run(async () => {
    const memberId = int(input.memberId, "Member_ID");
    const d = date(input.date);
    const ranged = "until" in input;
    const until = optDate(input.until, "ถึงวันที่");
    const by = byOf(input.by);
    await tx(async (t) => {
      const u = await new sql.Request(t).input("m", sql.Int, memberId).query(`
        SELECT Unit_ID, CONVERT(varchar(10), end_date, 23) AS end_date FROM dbo.Org_Member WHERE Member_ID = @m AND Actived = 1`);
      const unitId = u.recordset[0]?.Unit_ID as number | undefined;
      if (unitId == null) throw new UserError("ไม่พบรายการนี้ (หรือถูกยกเลิกแล้ว)");
      // ปลายช่วงที่จะเป็นหัวหน้า (null = ไม่มีวันจบ)
      const rEnd: string | null = ranged ? (until ?? u.recordset[0].end_date ?? null) : d;
      // หัวหน้าคนอื่นที่ทับช่วง -> ถอดเฉพาะส่วนที่ทับก่อน แล้วค่อยตั้งคนใหม่ (trigger ห้ามหัวหน้าซ้อน)
      const olds = await new sql.Request(t)
        .input("u", sql.Int, unitId).input("m", sql.Int, memberId)
        .input("d", sql.VarChar(10), d).input("e", sql.VarChar(10), rEnd).query(`
        SELECT Member_ID, CONVERT(varchar(10), start_date, 23) AS start_date, CONVERT(varchar(10), end_date, 23) AS end_date
        FROM dbo.Org_Member WITH (UPDLOCK)
        WHERE Unit_ID = @u AND Actived = 1 AND is_manager = 1 AND Member_ID <> @m
          AND (end_date IS NULL OR end_date >= CAST(@d AS date))
          AND (@e IS NULL OR start_date IS NULL OR start_date <= CAST(@e AS date))`);
      for (const o of olds.recordset as { Member_ID: number; start_date: string | null; end_date: string | null }[]) {
        if (!ranged) {
          await applyManager(t, o.Member_ID, false, d, by);
          continue;
        }
        const s = o.start_date && o.start_date > d ? o.start_date : d;
        const e = !rEnd ? null : o.end_date && o.end_date < rEnd ? null : rEnd; // null = ถึงวันจบของแถวนั้น
        await applyManager(t, o.Member_ID, false, s, by, e);
      }
      await applyManager(t, memberId, true, d, by, ranged ? until : null);
    });
    return getUnits();
  });
}

/** ให้ออกจากห้องนี้: end_date = วันสุดท้ายที่อยู่ */
export async function endMember(input: { memberId: number; date: string; by?: string }): Promise<ActionResult<OrgUnitRow[]>> {
  return run(async () => {
    const memberId = int(input.memberId, "Member_ID");
    const d = date(input.date);
    const pool = await getPool();
    const cur = await pool.request().input("m", sql.Int, memberId).query(`
      SELECT m.Actived, m.is_manager, un.unit_code,
             CONVERT(varchar(10), m.start_date, 23) AS start_date, CONVERT(varchar(10), m.end_date, 23) AS end_date
      FROM dbo.Org_Member m JOIN dbo.Org_Unit un ON un.Unit_ID = m.Unit_ID WHERE m.Member_ID = @m`);
    const row = cur.recordset[0];
    if (!row || !row.Actived) throw new UserError("ไม่พบรายการนี้ (หรือถูกยกเลิกแล้ว)");
    if (row.start_date && row.start_date > d) throw new UserError("วันสุดท้ายต้องไม่ก่อนวันที่เริ่ม — ถ้าสร้างผิดให้ใช้ \"ยกเลิกรายการ\"");
    if (row.end_date && row.end_date <= d) throw new UserError(`รายการนี้จบวันที่ ${row.end_date} อยู่แล้ว`);
    await pool.request().input("m", sql.Int, memberId).input("d", sql.VarChar(10), d).input("by", sql.VarChar(50), byOf(input.by)).query(`
      UPDATE dbo.Org_Member SET end_date = CAST(@d AS date),
             UpdateBy = ISNULL(@by, LEFT(SUSER_SNAME(), 50)), UpdateDate = GETDATE()
      WHERE Member_ID = @m`);
    const note = row.is_manager ? `ห้อง ${row.unit_code} จะไม่มีหัวหน้าหลังวันที่ ${d}` : null;
    return { data: await getUnits(), note };
  });
}

/** แก้ข้อมูลที่กรอกผิดตรง ๆ (ไม่แบ่งแถว) */
export async function editMember(input: {
  memberId: number; positionId: number; startDate: string | null; endDate: string | null; by?: string;
}): Promise<ActionResult<OrgUnitRow[]>> {
  return run(async () => {
    const s = optDate(input.startDate, "วันที่เริ่ม");
    const e = optDate(input.endDate, "วันที่จบ");
    if (s && e && e < s) throw new UserError("วันที่จบต้องไม่ก่อนวันที่เริ่ม");
    const pool = await getPool();
    const r = await pool.request()
      .input("m", sql.Int, int(input.memberId, "Member_ID")).input("pos", sql.Int, int(input.positionId, "ตำแหน่ง"))
      .input("s", sql.VarChar(10), s).input("e", sql.VarChar(10), e).input("by", sql.VarChar(50), byOf(input.by))
      .query(`UPDATE dbo.Org_Member SET PositionID = @pos, start_date = CAST(@s AS date), end_date = CAST(@e AS date),
                     UpdateBy = ISNULL(@by, LEFT(SUSER_SNAME(), 50)), UpdateDate = GETDATE()
              WHERE Member_ID = @m AND Actived = 1`);
    if (!r.rowsAffected[0]) throw new UserError("ไม่พบรายการนี้ (หรือถูกยกเลิกแล้ว)");
    return getUnits();
  });
}

/** ยกเลิกรายการที่สร้างผิด (Actived = 0) — ไม่ลบแถว */
export async function cancelMember(input: { memberId: number; by?: string }): Promise<ActionResult<OrgUnitRow[]>> {
  return run(async () => {
    const pool = await getPool();
    const r = await pool.request().input("m", sql.Int, int(input.memberId, "Member_ID")).input("by", sql.VarChar(50), byOf(input.by)).query(`
      UPDATE dbo.Org_Member SET Actived = 0, UpdateBy = ISNULL(@by, LEFT(SUSER_SNAME(), 50)), UpdateDate = GETDATE()
      WHERE Member_ID = @m AND Actived = 1`);
    if (!r.rowsAffected[0]) throw new UserError("ไม่พบรายการนี้ (หรือถูกยกเลิกแล้ว)");
    return getUnits();
  });
}
