/* =====================================================================
   002_org_unit_pos : ตำแหน่ง node บนผังห้อง (ข้อมูลหน้าจอ ไม่ใช่โครงสร้างองค์กร)

   UserID  = เจ้าของผัง (dbo.Users.UserID) · 0 = ผังกลาง (ค่าเริ่มต้นของคนที่ยังไม่มีผังตัวเอง)
             จึงไม่มี FK ไป dbo.Users (ไม่มี user 0)
   แยกจาก Org_Unit เพื่อไม่ให้การลาก node ไปแตะ UpdateBy / UpdateDate / trigger ของ Org_Unit
   ห้องที่ปิดแล้ว (Actived = 0) แถวยังอยู่ได้ — ไม่มีผลกับผัง

   รันซ้ำได้ (idempotent)
   ===================================================================== */
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID('dbo.Org_UnitPos') IS NULL
    CREATE TABLE dbo.Org_UnitPos (
        UserID     bigint   NOT NULL,                    -- 0 = ผังกลาง
        Unit_ID    int      NOT NULL
                   CONSTRAINT FK_Org_UnitPos_Unit REFERENCES dbo.Org_Unit (Unit_ID),
        pos_x      float    NOT NULL,
        pos_y      float    NOT NULL,
        UpdateDate datetime NOT NULL CONSTRAINT DF_Org_UnitPos_UpdateDate DEFAULT (GETDATE()),
        CONSTRAINT PK_Org_UnitPos PRIMARY KEY (UserID, Unit_ID)
    );

COMMIT TRANSACTION;
