/* =====================================================================
   003_drop_unit_dep_sec : ตัด DepID / SecID ออกจาก Org_Unit

   เหตุผล: ผังห้องใช้แทน Department / Section ได้ทั้งหมดแล้ว
     - ห้องประเภท DEPT = ฝ่าย, SECTION = แผนก (ชื่อ/รหัสอยู่ใน unit_name / unit_code)
     - ฝ่ายไหนมีแผนกอะไร = parent_unit_id
     - Department / Section ไม่มี ComID จึงใช้กับหลายบริษัทไม่ได้
     - 1 คนอยู่ได้หลายห้องผ่าน Org_Member อยู่แล้ว
   ยังไม่มีระบบไหนใช้ view สองตัวนี้ จึงตัด DepCode / SecCode ออกจาก view ไปด้วย
   (ค่าเดิมยังดูย้อนหลังได้ใน Org_ChangeLog.old_json)

   รันซ้ำได้ (idempotent) · แยกเป็นหลาย batch เพราะ CREATE OR ALTER VIEW ต้องอยู่ต้น batch
   ===================================================================== */

/* 1) view: เอา Department / Section ออก ---------------------------------- */
GO
CREATE OR ALTER VIEW dbo.vw_Org_Unit
AS
/* vw_Org_Unit : ผังห้อง + หัวหน้าวันนี้ + จำนวนคน */
SELECT un.Unit_ID, un.ComID, un.unit_code, un.unit_type, un.unit_name,
       pu.unit_code AS parent_code,
       mu.UserCode AS manager, mp.PositionCode AS manager_position,
       (SELECT COUNT(*) FROM dbo.vw_Org_UserPosition v WHERE v.Unit_ID = un.Unit_ID) AS members
FROM dbo.Org_Unit un
LEFT JOIN dbo.Org_Unit pu ON pu.Unit_ID = un.parent_unit_id
OUTER APPLY dbo.ufn_Org_UnitManager(un.Unit_ID, NULL) mg
LEFT JOIN dbo.Users mu    ON mu.UserID = mg.UserID
LEFT JOIN dbo.Position mp ON mp.PositionID = mg.PositionID
WHERE un.Actived = 1;
GO

CREATE OR ALTER VIEW dbo.vw_Org_UserPosition
AS
/* vw_Org_UserPosition : 1 แถว = 1 คน x 1 ห้องที่อยู่วันนี้ */
SELECT u.UserID, u.UserCode, u.Name,
       un.ComID, c.ComCode, un.Unit_ID, un.unit_code, un.unit_type, un.unit_name,
       p.PositionID, p.PositionCode, p.rank_no,
       m.Member_ID, m.is_manager, m.is_primary, m.start_date, m.end_date
FROM dbo.Org_Member m
JOIN dbo.Org_Unit un ON un.Unit_ID = m.Unit_ID
JOIN dbo.Company c   ON c.ComID = un.ComID
JOIN dbo.Position p  ON p.PositionID = m.PositionID
JOIN dbo.Users u     ON u.UserID = m.UserID
WHERE m.Actived = 1
  AND (m.start_date IS NULL OR m.start_date <= CAST(GETDATE() AS date))
  AND (m.end_date   IS NULL OR m.end_date   >= CAST(GETDATE() AS date));
GO

/* vw_Org_Boss อ่านจาก vw_Org_UserPosition — refresh metadata */
EXEC sp_refreshview 'dbo.vw_Org_Boss';
GO

/* 2) ตาราง: ลบ FK / index / คอลัมน์ ------------------------------------ */
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID('dbo.FK_Org_Unit_Department', 'F') IS NOT NULL
    ALTER TABLE dbo.Org_Unit DROP CONSTRAINT FK_Org_Unit_Department;
IF OBJECT_ID('dbo.FK_Org_Unit_Section', 'F') IS NOT NULL
    ALTER TABLE dbo.Org_Unit DROP CONSTRAINT FK_Org_Unit_Section;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.Org_Unit') AND name = 'IX_Org_Unit_dep')
    DROP INDEX IX_Org_Unit_dep ON dbo.Org_Unit;
IF COL_LENGTH('dbo.Org_Unit', 'DepID') IS NOT NULL
    ALTER TABLE dbo.Org_Unit DROP COLUMN DepID;
IF COL_LENGTH('dbo.Org_Unit', 'SecID') IS NOT NULL
    ALTER TABLE dbo.Org_Unit DROP COLUMN SecID;

COMMIT TRANSACTION;
GO
