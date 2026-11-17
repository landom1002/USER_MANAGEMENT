/* =====================================================================
   001_org_unit_types : ประเภทห้อง (ตารางกำหนดค่า)

   ระดับ:  COMPANY 5 > LINE 4 > DEPT 3 > SECTION 2 > AREA 1
           TEAM = กลุ่มสายรายงาน (level_no NULL) — ระดับ = Position.rank_no ของหัวหน้าทีม
   กฎ (เตือนใน UI เท่านั้น ไม่บังคับใน DB):
     1) ระดับห้องแม่ต้องสูงกว่าห้องลูก (ข้ามระดับได้)
   หัวหน้าห้องเป็นตำแหน่งไหนก็ได้ — ไม่ตรวจ

   รันซ้ำได้ (idempotent)
   ===================================================================== */
SET XACT_ABORT ON;
BEGIN TRANSACTION;

/* 1) ตำแหน่ง GM — หัวหน้าบริษัทแทน MD */
IF NOT EXISTS (SELECT 1 FROM dbo.Position WHERE PositionCode = 'GM')
    INSERT dbo.Position (PositionCode, Position, is_active, rank_no)
    VALUES ('GM', N'ผู้จัดการทั่วไป', 1, 5);

/* 2) ประเภทห้อง */
IF OBJECT_ID('dbo.Org_UnitType') IS NULL
    CREATE TABLE dbo.Org_UnitType (
        unit_type varchar(10)  NOT NULL CONSTRAINT PK_Org_UnitType PRIMARY KEY,
        level_no  int          NULL,            -- NULL = TEAM (ระดับตามตำแหน่งหัวหน้า)
        name_th   nvarchar(50) NOT NULL,
        color     varchar(7)   NOT NULL,        -- สีบน node (#rrggbb)
        sort_no   int          NOT NULL
    );

MERGE dbo.Org_UnitType AS t
USING (VALUES
    ('COMPANY', 5,    N'บริษัท',  '#3b82f6', 1),
    ('LINE',    4,    N'สายงาน',  '#8b5cf6', 2),
    ('DEPT',    3,    N'ฝ่าย',    '#10b981', 3),
    ('SECTION', 2,    N'แผนก',    '#f59e0b', 4),
    ('AREA',    1,    N'เขต',     '#ef4444', 5),
    ('TEAM',    NULL, N'ทีม',     '#64748b', 6)
) AS s (unit_type, level_no, name_th, color, sort_no)
ON t.unit_type = s.unit_type
WHEN MATCHED THEN UPDATE SET level_no = s.level_no, name_th = s.name_th, color = s.color, sort_no = s.sort_no
WHEN NOT MATCHED THEN INSERT (unit_type, level_no, name_th, color, sort_no)
                      VALUES (s.unit_type, s.level_no, s.name_th, s.color, s.sort_no);

/* 3) เลิกใช้ Org_UnitTypeHead (เดิมกำหนดตำแหน่งหัวหน้าที่ควรเป็น) — หัวหน้าเป็นตำแหน่งไหนก็ได้ */
IF OBJECT_ID('dbo.Org_UnitTypeHead') IS NOT NULL
    DROP TABLE dbo.Org_UnitTypeHead;

/* 4) Org_Unit.unit_type อ้างอิงตารางประเภทแทน CHECK — เพิ่มประเภทใหม่ได้ด้วยการ INSERT */
IF OBJECT_ID('dbo.CK_Org_Unit_type', 'C') IS NOT NULL
    ALTER TABLE dbo.Org_Unit DROP CONSTRAINT CK_Org_Unit_type;
IF OBJECT_ID('dbo.FK_Org_Unit_Type', 'F') IS NULL
    ALTER TABLE dbo.Org_Unit ADD CONSTRAINT FK_Org_Unit_Type
        FOREIGN KEY (unit_type) REFERENCES dbo.Org_UnitType (unit_type);

COMMIT TRANSACTION;
