/* =====================================================================
   005_unit_version_and_seat : ห้องมีช่วงวันที่ + ตำแหน่งแบบเก้าอี้ (seat)
   ต้องรัน 004 ก่อน (ใช้ Position.ComID)

   ออกแบบให้ "เพิ่มอย่างเดียว" — ของเดิมทำงานเหมือนเดิมทุกอย่าง
     - Org_Unit ยังเป็น "ค่าปัจจุบัน" ที่แอปอ่าน/แก้อยู่
     - Org_UnitVersion เก็บประวัติแบบมีช่วงวันที่ — trigger บน Org_Unit เขียนให้เอง
     - Org_Seat + Org_Member.Seat_ID (NULL ได้) — ยังไม่บังคับใช้ เริ่มผูกเก้าอี้เมื่อพร้อม

   ---------------------------------------------------------------------
   A) Org_UnitVersion : 1 แถว = ค่าของห้องในช่วง [valid_from, valid_to]
        ช่วงของห้องเดียวกันห้ามทับกัน · ช่วงปัจจุบัน valid_to = 9999-12-31
        แก้ Org_Unit (รหัส / ประเภท / ชื่อ / ห้องแม่ / ปิดห้อง) -> มีผล "วันนี้"
          ช่วงเดิมจบเมื่อวาน · ช่วงใหม่เริ่มวันนี้ (แก้หลายครั้งในวันเดียว = ทับช่วงของวันนี้)
          ปิดห้อง (Actived = 0) -> ช่วงสุดท้ายจบเมื่อวาน (วันนี้ห้องไม่อยู่แล้ว)
        ดูผัง ณ วันที่ : SELECT * FROM dbo.ufn_Org_UnitAsOf('2026-03-01')

   B) Org_Seat : เก้าอี้ในห้อง = ห้อง + ตำแหน่ง (job จาก dbo.Position)
        is_manager         = เก้าอี้หัวหน้าห้อง (ห้องหนึ่งมีได้ 1 ตัว ณ วันใดวันหนึ่ง)
        reports_to_seat_id = รายงานต่อเก้าอี้ไหน · NULL = ตามสายห้องตามเดิม
        valid_from/to      = ช่วงที่มีเก้าอี้นี้ (อัตรากำลัง)
      Org_Member.Seat_ID : คนนั่งเก้าอี้ไหน (NULL = ยังไม่ผูกเก้าอี้ ทำงานแบบเดิม)
        ถ้าผูก -> ห้อง / ตำแหน่ง / หัวหน้า ต้องตรงกับเก้าอี้ และ 1 เก้าอี้นั่งได้ 1 คน ณ วันใดวันหนึ่ง
      vw_Org_Seat : เก้าอี้วันนี้ + คนนั่ง + ว่างไหม

   รันซ้ำได้ (idempotent) · แยกหลาย batch เพราะ CREATE OR ALTER ต้องอยู่ต้น batch
   ===================================================================== */

IF COL_LENGTH('dbo.Position', 'ComID') IS NULL
BEGIN
    RAISERROR (N'ต้องรัน 004_position_comid.sql ก่อน — ไม่ได้รันอะไรในไฟล์นี้', 16, 1);
    SET NOEXEC ON;   -- ข้ามทุก batch ที่เหลือ (ปิดที่ท้ายไฟล์)
END
GO

/* =====================================================================
   A) ห้องมีช่วงวันที่
   ===================================================================== */
IF OBJECT_ID('dbo.Org_UnitVersion') IS NULL
    CREATE TABLE dbo.Org_UnitVersion (
        Version_ID     int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Org_UnitVersion PRIMARY KEY,
        Unit_ID        int           NOT NULL CONSTRAINT FK_Org_UnitVersion_Unit   REFERENCES dbo.Org_Unit (Unit_ID),
        valid_from     date          NOT NULL,
        valid_to       date          NOT NULL CONSTRAINT DF_Org_UnitVersion_to DEFAULT ('99991231'),
        unit_code      varchar(40)   NOT NULL,
        unit_type      varchar(10)   NOT NULL CONSTRAINT FK_Org_UnitVersion_Type   REFERENCES dbo.Org_UnitType (unit_type),
        unit_name      nvarchar(150) NULL,
        parent_unit_id int           NULL     CONSTRAINT FK_Org_UnitVersion_Parent REFERENCES dbo.Org_Unit (Unit_ID),
        CreateBy       varchar(50)   NULL,
        CreateDate     datetime      NOT NULL CONSTRAINT DF_Org_UnitVersion_cd DEFAULT (GETDATE()),
        CONSTRAINT CK_Org_UnitVersion_dates CHECK (valid_to >= valid_from),
        CONSTRAINT UQ_Org_UnitVersion UNIQUE (Unit_ID, valid_from)
    );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.Org_UnitVersion') AND name = 'IX_Org_UnitVersion_asof')
    CREATE INDEX IX_Org_UnitVersion_asof ON dbo.Org_UnitVersion (valid_from, valid_to)
        INCLUDE (Unit_ID, unit_code, unit_type, unit_name, parent_unit_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.Org_UnitVersion') AND name = 'IX_Org_UnitVersion_parent')
    CREATE INDEX IX_Org_UnitVersion_parent ON dbo.Org_UnitVersion (parent_unit_id);
GO

/* ช่วงของห้องเดียวกันห้ามทับกัน (กันคนแก้ตารางนี้ตรง ๆ เช่นลงประวัติย้อนหลัง) */
CREATE OR ALTER TRIGGER dbo.trg_Org_UnitVersion_Check ON dbo.Org_UnitVersion AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM inserted i
               JOIN dbo.Org_UnitVersion o ON o.Unit_ID = i.Unit_ID AND o.Version_ID <> i.Version_ID
                AND o.valid_from <= i.valid_to AND i.valid_from <= o.valid_to)
    BEGIN
        RAISERROR (N'Org_UnitVersion: ช่วงวันที่ของห้องเดียวกันทับกัน', 16, 1);
        ROLLBACK TRANSACTION;
    END
END
GO

/* Org_Unit เปลี่ยน -> เขียนช่วงใหม่ให้อัตโนมัติ (มีผลวันนี้) */
CREATE OR ALTER TRIGGER dbo.trg_Org_Unit_Version ON dbo.Org_Unit AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @today date = CAST(GETDATE() AS date);
    DECLARE @yesterday date = DATEADD(DAY, -1, @today);

    -- ห้องที่ค่าเปลี่ยนจริง (ไม่นับแก้แค่ UpdateBy / UpdateDate)
    DECLARE @ch TABLE (Unit_ID int PRIMARY KEY, Actived bit, unit_code varchar(40), unit_type varchar(10),
                       unit_name nvarchar(150), parent_unit_id int, by_ varchar(50));
    INSERT @ch
    SELECT i.Unit_ID, i.Actived, i.unit_code, i.unit_type, i.unit_name, i.parent_unit_id, ISNULL(i.UpdateBy, i.CreateBy)
    FROM inserted i LEFT JOIN deleted d ON d.Unit_ID = i.Unit_ID
    WHERE d.Unit_ID IS NULL
       OR EXISTS (SELECT i.unit_code, i.unit_type, i.unit_name, i.parent_unit_id, i.Actived
                  EXCEPT
                  SELECT d.unit_code, d.unit_type, d.unit_name, d.parent_unit_id, d.Actived);
    IF NOT EXISTS (SELECT 1 FROM @ch) RETURN;

    -- ช่วงที่เริ่มวันนี้ -> ทิ้ง (จะเขียนใหม่ทับ)
    DELETE v FROM dbo.Org_UnitVersion v JOIN @ch c ON c.Unit_ID = v.Unit_ID
    WHERE v.valid_from >= @today;

    -- ช่วงปัจจุบันที่เริ่มก่อนวันนี้ -> จบเมื่อวาน
    UPDATE v SET valid_to = @yesterday
    FROM dbo.Org_UnitVersion v JOIN @ch c ON c.Unit_ID = v.Unit_ID
    WHERE v.valid_to >= @today;

    -- ห้องที่ยังเปิด -> ช่วงใหม่เริ่มวันนี้
    INSERT dbo.Org_UnitVersion (Unit_ID, valid_from, unit_code, unit_type, unit_name, parent_unit_id, CreateBy)
    SELECT Unit_ID, @today, unit_code, unit_type, unit_name, parent_unit_id, by_
    FROM @ch WHERE Actived = 1;
END
GO

/* ประวัติตั้งต้น: ห้องที่ยังไม่มีช่วงเลย -> 1 ช่วง ตั้งแต่วันที่สร้าง
   (ห้องที่ปิดแล้ว จบก่อนวันที่ปิด 1 วัน · ประวัติก่อนหน้านี้ไม่ย้อนสร้างจาก Org_ChangeLog) */
INSERT dbo.Org_UnitVersion (Unit_ID, valid_from, valid_to, unit_code, unit_type, unit_name, parent_unit_id, CreateBy)
SELECT u.Unit_ID, x.f,
       CASE WHEN u.Actived = 1 THEN '99991231' ELSE DATEADD(DAY, -1, CAST(u.UpdateDate AS date)) END,
       u.unit_code, u.unit_type, u.unit_name, u.parent_unit_id, '005_backfill'
FROM dbo.Org_Unit u
CROSS APPLY (SELECT ISNULL(CAST(u.CreateDate AS date), '19000101') AS f) x
WHERE NOT EXISTS (SELECT 1 FROM dbo.Org_UnitVersion v WHERE v.Unit_ID = u.Unit_ID)
  AND (u.Actived = 1 OR DATEADD(DAY, -1, CAST(u.UpdateDate AS date)) >= x.f);
GO

/* ผังห้อง ณ วันที่ (NULL = วันนี้) */
CREATE OR ALTER FUNCTION dbo.ufn_Org_UnitAsOf (@as_of date)
RETURNS TABLE
AS
RETURN
SELECT v.Unit_ID, u.ComID, v.unit_code, v.unit_type, v.unit_name, v.parent_unit_id, v.valid_from, v.valid_to
FROM dbo.Org_UnitVersion v
JOIN dbo.Org_Unit u ON u.Unit_ID = v.Unit_ID
WHERE ISNULL(@as_of, CAST(GETDATE() AS date)) BETWEEN v.valid_from AND v.valid_to;
GO

/* =====================================================================
   B) ตำแหน่งแบบเก้าอี้ (seat)
   ===================================================================== */
IF OBJECT_ID('dbo.Org_Seat') IS NULL
    CREATE TABLE dbo.Org_Seat (
        Seat_ID            int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Org_Seat PRIMARY KEY,
        Unit_ID            int           NOT NULL CONSTRAINT FK_Org_Seat_Unit     REFERENCES dbo.Org_Unit (Unit_ID),
        PositionID         int           NOT NULL CONSTRAINT FK_Org_Seat_Position REFERENCES dbo.Position (PositionID),
        seat_name          nvarchar(150) NULL,                    -- เช่น "พนักงานขาย #1" · NULL = ใช้ชื่อตำแหน่ง
        is_manager         bit           NOT NULL CONSTRAINT DF_Org_Seat_mgr DEFAULT (0),
        reports_to_seat_id int           NULL     CONSTRAINT FK_Org_Seat_ReportsTo REFERENCES dbo.Org_Seat (Seat_ID),
        valid_from         date          NULL,
        valid_to           date          NULL,
        Actived            bit           NOT NULL CONSTRAINT DF_Org_Seat_act DEFAULT (1),
        CreateBy           varchar(50)   NULL,
        CreateDate         datetime      NOT NULL CONSTRAINT DF_Org_Seat_cd DEFAULT (GETDATE()),
        UpdateBy           varchar(50)   NULL,
        UpdateDate         datetime      NULL,
        CONSTRAINT CK_Org_Seat_dates CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
        CONSTRAINT CK_Org_Seat_self  CHECK (reports_to_seat_id IS NULL OR reports_to_seat_id <> Seat_ID)
    );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.Org_Seat') AND name = 'IX_Org_Seat_unit')
    CREATE INDEX IX_Org_Seat_unit ON dbo.Org_Seat (Unit_ID, is_manager) INCLUDE (PositionID, valid_from, valid_to, Actived);
GO

IF COL_LENGTH('dbo.Org_Member', 'Seat_ID') IS NULL
    ALTER TABLE dbo.Org_Member ADD Seat_ID int NULL;
GO
IF OBJECT_ID('dbo.FK_Org_Member_Seat', 'F') IS NULL
    ALTER TABLE dbo.Org_Member ADD CONSTRAINT FK_Org_Member_Seat FOREIGN KEY (Seat_ID) REFERENCES dbo.Org_Seat (Seat_ID);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.Org_Member') AND name = 'IX_Org_Member_seat')
    CREATE INDEX IX_Org_Member_seat ON dbo.Org_Member (Seat_ID) INCLUDE (UserID, start_date, end_date, Actived) WHERE Seat_ID IS NOT NULL;
GO

/* กฎของเก้าอี้ */
CREATE OR ALTER TRIGGER dbo.trg_Org_Seat_Check ON dbo.Org_Seat AFTER INSERT, UPDATE
AS
/* trg_Org_Seat_Check
     1) ตำแหน่งต้องเป็นตำแหน่งกลาง หรือของบริษัทเดียวกับห้อง
     2) ห้องหนึ่งมีเก้าอี้หัวหน้าได้ 1 ตัว ณ วันใดวันหนึ่ง
     3) รายงานต่อเก้าอี้ในบริษัทเดียวกันเท่านั้น และห้ามวน
     4) เก้าอี้ที่มี/เคยมีคนนั่ง -> ห้าม เปลี่ยนห้อง / ตำแหน่ง / หัวหน้า (ประวัติคนนั่งต้องตรงกับเก้าอี้) */
BEGIN
    SET NOCOUNT ON;
    DECLARE @msg nvarchar(200);

    IF EXISTS (SELECT 1 FROM inserted i
               JOIN dbo.Position p  ON p.PositionID = i.PositionID
               JOIN dbo.Org_Unit un ON un.Unit_ID = i.Unit_ID
               WHERE i.Actived = 1 AND p.ComID IS NOT NULL AND p.ComID <> un.ComID)
        SET @msg = N'ตำแหน่งนี้เป็นของบริษัทอื่น ใช้กับห้องนี้ไม่ได้';

    ELSE IF EXISTS (SELECT 1 FROM inserted i
                    JOIN dbo.Org_Seat o ON o.Seat_ID <> i.Seat_ID AND o.Unit_ID = i.Unit_ID
                     AND o.is_manager = 1 AND o.Actived = 1
                     AND ISNULL(o.valid_from, '19000101') <= ISNULL(i.valid_to, '99991231')
                     AND ISNULL(i.valid_from, '19000101') <= ISNULL(o.valid_to, '99991231')
                    WHERE i.is_manager = 1 AND i.Actived = 1)
        SET @msg = N'ห้องนี้มีเก้าอี้หัวหน้าอยู่แล้วในช่วงวันที่เดียวกัน';

    ELSE IF EXISTS (SELECT 1 FROM inserted i
                    JOIN dbo.Org_Unit un ON un.Unit_ID = i.Unit_ID
                    JOIN dbo.Org_Seat r  ON r.Seat_ID = i.reports_to_seat_id
                    JOIN dbo.Org_Unit ru ON ru.Unit_ID = r.Unit_ID
                    WHERE ru.ComID <> un.ComID)
        SET @msg = N'รายงานต่อเก้าอี้ของบริษัทอื่นไม่ได้';

    ELSE IF EXISTS (SELECT 1 FROM inserted i
                    JOIN dbo.Org_Member m ON m.Seat_ID = i.Seat_ID AND m.Actived = 1
                    WHERE m.Unit_ID <> i.Unit_ID OR m.PositionID <> i.PositionID OR m.is_manager <> i.is_manager)
        SET @msg = N'เก้าอี้นี้มี (หรือเคยมี) คนนั่ง — เปลี่ยนห้อง / ตำแหน่ง / หัวหน้าไม่ได้ ให้ปิดเก้าอี้นี้แล้วสร้างใหม่';

    IF @msg IS NULL AND UPDATE(reports_to_seat_id)
    BEGIN
        DECLARE @loops int;
        WITH up AS (
            SELECT i.Seat_ID AS start_id, i.reports_to_seat_id AS cur_id, 1 AS depth FROM inserted i WHERE i.reports_to_seat_id IS NOT NULL
            UNION ALL
            SELECT up.start_id, s.reports_to_seat_id, up.depth + 1
            FROM up JOIN dbo.Org_Seat s ON s.Seat_ID = up.cur_id
            WHERE s.reports_to_seat_id IS NOT NULL AND up.cur_id <> up.start_id AND up.depth < 30
        )
        SELECT @loops = COUNT(*) FROM up WHERE up.cur_id = up.start_id OR up.depth >= 30
        OPTION (MAXRECURSION 40);
        IF @loops > 0 SET @msg = N'สายรายงานของเก้าอี้วนกลับมาหาตัวเอง';
    END

    IF @msg IS NOT NULL
    BEGIN
        RAISERROR (N'Org_Seat: %s', 16, 1, @msg);
        ROLLBACK TRANSACTION;
    END
END
GO

/* Org_Member: เพิ่มกฎข้อ 5 (เก้าอี้) — ข้อ 1-4 เหมือน 004 */
CREATE OR ALTER TRIGGER dbo.trg_Org_Member_Check ON dbo.Org_Member AFTER INSERT, UPDATE
AS
/* ---------------------------------------------------------------------
   trg_Org_Member_Check : กฎข้ามแถว (ช่วงวันที่ห้ามทับกัน)
     1) ห้องหนึ่ง มีหัวหน้าได้ 1 คน ณ วันใดวันหนึ่ง
     2) คนหนึ่ง มีห้องหลักได้ 1 ห้อง ณ วันใดวันหนึ่ง
     3) คนหนึ่ง อยู่ห้องเดียวกันซ้อนช่วงวันที่กันไม่ได้
     4) ตำแหน่งต้องเป็นตำแหน่งกลาง (ComID NULL) หรือของบริษัทเดียวกับห้อง
     5) ผูกเก้าอี้ (Seat_ID) -> ห้อง / ตำแหน่ง / หัวหน้า ตรงกับเก้าอี้ · อยู่ในช่วงวันที่ของเก้าอี้
        · 1 เก้าอี้นั่งได้ 1 คน ณ วันใดวันหนึ่ง
   --------------------------------------------------------------------- */
BEGIN
    SET NOCOUNT ON;
    DECLARE @msg nvarchar(200);

    IF EXISTS (SELECT 1 FROM inserted i
               JOIN dbo.Position p  ON p.PositionID = i.PositionID
               JOIN dbo.Org_Unit un ON un.Unit_ID = i.Unit_ID
               WHERE i.Actived = 1 AND p.ComID IS NOT NULL AND p.ComID <> un.ComID)
        SET @msg = N'ตำแหน่งนี้เป็นของบริษัทอื่น ใช้กับห้องนี้ไม่ได้';

    ELSE IF EXISTS (SELECT 1 FROM inserted i
                    JOIN dbo.Org_Seat s ON s.Seat_ID = i.Seat_ID
                    WHERE i.Actived = 1
                      AND (   s.Unit_ID <> i.Unit_ID OR s.PositionID <> i.PositionID OR s.is_manager <> i.is_manager
                           OR s.Actived = 0
                           OR ISNULL(i.start_date, '19000101') < ISNULL(s.valid_from, '19000101')
                           OR ISNULL(i.end_date, '99991231')   > ISNULL(s.valid_to, '99991231')))
        SET @msg = N'ห้อง / ตำแหน่ง / หัวหน้า / ช่วงวันที่ ไม่ตรงกับเก้าอี้ที่ผูกไว้';

    ELSE IF EXISTS (SELECT 1 FROM inserted i
                    JOIN dbo.Org_Member o ON o.Member_ID <> i.Member_ID AND o.Seat_ID = i.Seat_ID AND o.Actived = 1
                     AND ISNULL(o.start_date, '19000101') <= ISNULL(i.end_date, '99991231')
                     AND ISNULL(i.start_date, '19000101') <= ISNULL(o.end_date, '99991231')
                    WHERE i.Actived = 1 AND i.Seat_ID IS NOT NULL)
        SET @msg = N'เก้าอี้นี้มีคนนั่งอยู่แล้วในช่วงวันที่เดียวกัน';

    ELSE
        SELECT TOP 1 @msg = CASE
                 WHEN i.is_manager = 1 AND o.is_manager = 1 AND o.Unit_ID = i.Unit_ID THEN N'ห้องนี้มีหัวหน้าอยู่แล้วในช่วงวันที่เดียวกัน'
                 WHEN i.is_primary = 1 AND o.is_primary = 1 AND o.UserID = i.UserID THEN N'คนนี้มีห้องหลักอยู่แล้วในช่วงวันที่เดียวกัน'
                 ELSE N'คนนี้อยู่ห้องนี้ซ้อนช่วงวันที่กัน' END
        FROM inserted i
        JOIN dbo.Org_Member o ON o.Member_ID <> i.Member_ID AND o.Actived = 1
         AND ISNULL(o.start_date, '19000101') <= ISNULL(i.end_date, '99991231')
         AND ISNULL(i.start_date, '19000101') <= ISNULL(o.end_date, '99991231')
        WHERE i.Actived = 1
          AND (   (i.is_manager = 1 AND o.is_manager = 1 AND o.Unit_ID = i.Unit_ID)
               OR (i.is_primary = 1 AND o.is_primary = 1 AND o.UserID = i.UserID)
               OR (o.UserID = i.UserID AND o.Unit_ID = i.Unit_ID));

    IF @msg IS NOT NULL
    BEGIN
        RAISERROR (N'Org_Member: %s', 16, 1, @msg);
        ROLLBACK TRANSACTION;
    END
END
GO

/* usp_Org_SetPrimary แบ่งแถวเดิมเป็นหลายชิ้น -> ให้ทุกชิ้นนั่งเก้าอี้เดิม (Seat_ID ติดไปด้วย)
   ส่วนอื่นเหมือนเดิมทุกบรรทัด */
CREATE OR ALTER PROCEDURE dbo.usp_Org_SetPrimary
    @member_id      int,
    @effective_date date        = NULL,     -- NULL = วันนี้
    @by             varchar(50) = NULL
AS
/* ---------------------------------------------------------------------
   usp_Org_SetPrimary
     แถวเป้าหมาย T (ต้องครอบคลุม @effective_date) -> เป็นห้องหลักช่วง [@d, T.end_date]
     ห้องหลักเดิม O ทุกแถวที่ทับช่วงนั้น ถูกแบ่งเป็น
       A [O.start, @d-1]          ยังเป็นห้องหลัก   (ถ้า O เริ่มก่อน @d)
       B [max(O.start,@d), min(O.end,T.end)]  ไม่เป็นห้องหลัก (ยังเป็นสมาชิกห้องนั้น)
       C [T.end+1, O.end]         กลับมาเป็นห้องหลัก (ถ้า T มีวันจบ และ O ยาวกว่า)
     แถวเดิมของ O = ชิ้นแรก (A ถ้ามี ไม่อย่างนั้น B) · ทุกชิ้นนั่งเก้าอี้เดิม
   --------------------------------------------------------------------- */
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @d date = ISNULL(@effective_date, CAST(GETDATE() AS date));
    DECLARE @prev date = DATEADD(DAY, -1, @d);
    DECLARE @uid bigint, @start date, @end date, @is_primary bit, @act bit;
    SET @by = ISNULL(@by, LEFT(SUSER_SNAME(), 50));

    SELECT @uid = UserID, @start = start_date, @end = end_date, @is_primary = is_primary, @act = Actived
    FROM dbo.Org_Member WHERE Member_ID = @member_id;

    IF @uid IS NULL
    BEGIN RAISERROR (N'usp_Org_SetPrimary: ไม่พบ Member_ID %d', 16, 1, @member_id); RETURN; END
    IF @act = 0
    BEGIN RAISERROR (N'usp_Org_SetPrimary: Member_ID %d ถูกยกเลิก (Actived = 0)', 16, 1, @member_id); RETURN; END
    IF ISNULL(@start, '19000101') > @d OR ISNULL(@end, '99991231') < @d
    BEGIN RAISERROR (N'usp_Org_SetPrimary: Member_ID %d ไม่ได้อยู่ห้องนี้ในวันที่มีผล', 16, 1, @member_id); RETURN; END

    IF @is_primary = 0
    BEGIN
        BEGIN TRY
            BEGIN TRANSACTION;

            /* 1) ห้องหลักเดิมที่ทับช่วง [@d, @end] */
            DECLARE @old TABLE (Member_ID int PRIMARY KEY, start_date date, end_date date,
                                has_a bit, b_end date, has_c bit);
            INSERT @old (Member_ID, start_date, end_date, has_a, b_end, has_c)
            SELECT m.Member_ID, m.start_date, m.end_date,
                   CASE WHEN ISNULL(m.start_date, '19000101') < @d THEN 1 ELSE 0 END,
                   CASE WHEN @end IS NULL THEN m.end_date
                        WHEN m.end_date IS NULL OR m.end_date > @end THEN @end
                        ELSE m.end_date END,
                   CASE WHEN @end IS NOT NULL AND ISNULL(m.end_date, '99991231') > @end THEN 1 ELSE 0 END
            FROM dbo.Org_Member m
            WHERE m.UserID = @uid AND m.Member_ID <> @member_id AND m.Actived = 1 AND m.is_primary = 1
              AND ISNULL(m.start_date, '19000101') <= ISNULL(@end, '99991231')
              AND ISNULL(m.end_date, '99991231') >= @d;

            -- แถวเดิม = ชิ้นแรก
            UPDATE m
            SET end_date   = CASE WHEN o.has_a = 1 THEN @prev ELSE o.b_end END,
                is_primary = o.has_a,
                UpdateBy = @by, UpdateDate = GETDATE()
            FROM dbo.Org_Member m JOIN @old o ON o.Member_ID = m.Member_ID;

            -- ชิ้น B (เมื่อแถวเดิมกลายเป็น A)
            INSERT dbo.Org_Member (Unit_ID, UserID, PositionID, Seat_ID, is_manager, is_primary, start_date, end_date, CreateBy)
            SELECT m.Unit_ID, m.UserID, m.PositionID, m.Seat_ID, m.is_manager, 0, @d, o.b_end, @by
            FROM dbo.Org_Member m JOIN @old o ON o.Member_ID = m.Member_ID
            WHERE o.has_a = 1;

            -- ชิ้น C
            INSERT dbo.Org_Member (Unit_ID, UserID, PositionID, Seat_ID, is_manager, is_primary, start_date, end_date, CreateBy)
            SELECT m.Unit_ID, m.UserID, m.PositionID, m.Seat_ID, m.is_manager, 1, DATEADD(DAY, 1, @end), o.end_date, @by
            FROM dbo.Org_Member m JOIN @old o ON o.Member_ID = m.Member_ID
            WHERE o.has_c = 1;

            /* 2) แถวเป้าหมาย */
            IF ISNULL(@start, '19000101') < @d
            BEGIN
                UPDATE dbo.Org_Member SET end_date = @prev, UpdateBy = @by, UpdateDate = GETDATE()
                WHERE Member_ID = @member_id;

                INSERT dbo.Org_Member (Unit_ID, UserID, PositionID, Seat_ID, is_manager, is_primary, start_date, end_date, CreateBy)
                SELECT Unit_ID, UserID, PositionID, Seat_ID, is_manager, 1, @d, @end, @by
                FROM dbo.Org_Member WHERE Member_ID = @member_id;
            END
            ELSE
                UPDATE dbo.Org_Member SET is_primary = 1, UpdateBy = @by, UpdateDate = GETDATE()
                WHERE Member_ID = @member_id;

            COMMIT TRANSACTION;
        END TRY
        BEGIN CATCH
            IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
            THROW;
        END CATCH
    END

    -- ผลลัพธ์ : ทุกแถวของคนนี้ที่ยังไม่จบ ณ วันที่มีผล
    SELECT m.Member_ID, un.ComID, un.unit_code, p.PositionCode, m.is_manager, m.is_primary, m.start_date, m.end_date
    FROM dbo.Org_Member m
    JOIN dbo.Org_Unit un ON un.Unit_ID = m.Unit_ID
    JOIN dbo.Position p  ON p.PositionID = m.PositionID
    WHERE m.UserID = @uid AND m.Actived = 1 AND ISNULL(m.end_date, '99991231') >= @prev
    ORDER BY m.start_date, m.Member_ID;
END
GO

/* usp_Org_MoveMember กรณีแถวเริ่มวันที่มีผลพอดี แก้ห้อง/ตำแหน่งในแถวเดิม -> ต้องปลดเก้าอี้เดิม (Seat_ID = NULL)
   กรณีแบ่งแถว แถวใหม่ไม่มี Seat_ID อยู่แล้ว · ส่วนอื่นเหมือนเดิมทุกบรรทัด */
CREATE OR ALTER PROCEDURE dbo.usp_Org_MoveMember
    @member_id      int,
    @to_unit_id     int,
    @effective_date date        = NULL,     -- NULL = วันนี้
    @position_id    int         = NULL,
    @is_manager     bit         = 0,
    @by             varchar(50) = NULL
AS
/* ---------------------------------------------------------------------
   usp_Org_MoveMember
     แถวเดิมจบที่ @d-1 · แถวใหม่ในห้อง @to_unit_id เริ่ม @d ถึง end_date เดิม
     is_primary ติดไปกับแถวใหม่ (ห้องหลักไม่หลุด) · เก้าอี้ไม่ติดไป (ห้องใหม่ = เก้าอี้ใหม่)
     @position_id NULL = ตำแหน่งเดิม · @is_manager = เป็นหัวหน้าห้องใหม่ไหม (ห้องใหม่มีหัวหน้าแล้ว trigger จะ error)
     ถ้าแถวเดิมเป็นหัวหน้า ห้องเดิมจะไม่มีหัวหน้าตั้งแต่ @d (แจ้งในผลลัพธ์ note)
   --------------------------------------------------------------------- */
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @d date = ISNULL(@effective_date, CAST(GETDATE() AS date));
    DECLARE @prev date = DATEADD(DAY, -1, @d);
    DECLARE @uid bigint, @unit int, @start date, @end date, @was_mgr bit, @act bit, @new_id int, @note nvarchar(200);
    SET @by = ISNULL(@by, LEFT(SUSER_SNAME(), 50));

    SELECT @uid = UserID, @unit = Unit_ID, @start = start_date, @end = end_date, @was_mgr = is_manager, @act = Actived,
           @position_id = ISNULL(@position_id, PositionID)
    FROM dbo.Org_Member WHERE Member_ID = @member_id;

    IF @uid IS NULL
    BEGIN RAISERROR (N'usp_Org_MoveMember: ไม่พบ Member_ID %d', 16, 1, @member_id); RETURN; END
    IF @act = 0
    BEGIN RAISERROR (N'usp_Org_MoveMember: Member_ID %d ถูกยกเลิก (Actived = 0)', 16, 1, @member_id); RETURN; END
    IF ISNULL(@start, '19000101') > @d OR ISNULL(@end, '99991231') < @d
    BEGIN RAISERROR (N'usp_Org_MoveMember: Member_ID %d ไม่ได้อยู่ห้องนี้ในวันที่มีผล', 16, 1, @member_id); RETURN; END
    IF @to_unit_id = @unit
    BEGIN RAISERROR (N'usp_Org_MoveMember: ห้องใหม่เป็นห้องเดิม', 16, 1); RETURN; END
    IF NOT EXISTS (SELECT 1 FROM dbo.Org_Unit WHERE Unit_ID = @to_unit_id AND Actived = 1)
    BEGIN RAISERROR (N'usp_Org_MoveMember: ไม่พบห้อง Unit_ID %d (หรือถูกปิด)', 16, 1, @to_unit_id); RETURN; END
    IF NOT EXISTS (SELECT 1 FROM dbo.Position WHERE PositionID = @position_id)
    BEGIN RAISERROR (N'usp_Org_MoveMember: ไม่พบ PositionID %d', 16, 1, @position_id); RETURN; END
    IF EXISTS (SELECT 1 FROM dbo.Org_Member
               WHERE UserID = @uid AND Unit_ID = @to_unit_id AND Actived = 1
                 AND ISNULL(start_date, '19000101') <= ISNULL(@end, '99991231')
                 AND ISNULL(end_date, '99991231') >= @d)
    BEGIN RAISERROR (N'usp_Org_MoveMember: คนนี้อยู่ห้องใหม่อยู่แล้วในช่วงวันที่นี้', 16, 1); RETURN; END

    BEGIN TRY
        BEGIN TRANSACTION;

        IF ISNULL(@start, '19000101') < @d
        BEGIN
            UPDATE dbo.Org_Member SET end_date = @prev, UpdateBy = @by, UpdateDate = GETDATE()
            WHERE Member_ID = @member_id;

            INSERT dbo.Org_Member (Unit_ID, UserID, PositionID, is_manager, is_primary, start_date, end_date, CreateBy)
            SELECT @to_unit_id, UserID, @position_id, @is_manager, is_primary, @d, @end, @by
            FROM dbo.Org_Member WHERE Member_ID = @member_id;
            SET @new_id = SCOPE_IDENTITY();
        END
        ELSE
        BEGIN
            UPDATE dbo.Org_Member
            SET Unit_ID = @to_unit_id, PositionID = @position_id, is_manager = @is_manager, Seat_ID = NULL,
                UpdateBy = @by, UpdateDate = GETDATE()
            WHERE Member_ID = @member_id;
            SET @new_id = @member_id;
        END

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH

    IF @was_mgr = 1 AND NOT EXISTS (SELECT 1 FROM dbo.ufn_Org_UnitManager(@unit, @d))
        SELECT @note = N'ห้องเดิม ' + unit_code + N' ไม่มีหัวหน้าตั้งแต่วันที่มีผล (จะใช้หัวหน้าห้องแม่แทน)'
        FROM dbo.Org_Unit WHERE Unit_ID = @unit;

    SELECT m.Member_ID, un.ComID, un.unit_code, p.PositionCode, m.is_manager, m.is_primary, m.start_date, m.end_date,
           CASE WHEN m.Member_ID = @new_id THEN @note END AS note
    FROM dbo.Org_Member m
    JOIN dbo.Org_Unit un ON un.Unit_ID = m.Unit_ID
    JOIN dbo.Position p  ON p.PositionID = m.PositionID
    WHERE m.UserID = @uid AND m.Actived = 1 AND ISNULL(m.end_date, '99991231') >= @prev
    ORDER BY m.start_date, m.Member_ID;
END
GO

/* เก้าอี้วันนี้ + คนนั่ง (ว่าง = is_vacant 1) — ใช้ดูอัตรากำลัง */
CREATE OR ALTER VIEW dbo.vw_Org_Seat
AS
SELECT s.Seat_ID, un.ComID, un.Unit_ID, un.unit_code, un.unit_name,
       ISNULL(s.seat_name, p.Position) AS seat_name, p.PositionCode, p.rank_no,
       s.is_manager, s.reports_to_seat_id,
       oc.Member_ID, oc.UserID, u.UserCode, u.Name,
       CAST(CASE WHEN oc.Member_ID IS NULL THEN 1 ELSE 0 END AS bit) AS is_vacant
FROM dbo.Org_Seat s
JOIN dbo.Org_Unit un ON un.Unit_ID = s.Unit_ID
JOIN dbo.Position p  ON p.PositionID = s.PositionID
OUTER APPLY (SELECT TOP 1 m.Member_ID, m.UserID
             FROM dbo.Org_Member m
             WHERE m.Seat_ID = s.Seat_ID AND m.Actived = 1
               AND (m.start_date IS NULL OR m.start_date <= CAST(GETDATE() AS date))
               AND (m.end_date   IS NULL OR m.end_date   >= CAST(GETDATE() AS date))
             ORDER BY m.Member_ID) oc
LEFT JOIN dbo.Users u ON u.UserID = oc.UserID
WHERE s.Actived = 1 AND un.Actived = 1
  AND (s.valid_from IS NULL OR s.valid_from <= CAST(GETDATE() AS date))
  AND (s.valid_to   IS NULL OR s.valid_to   >= CAST(GETDATE() AS date));
GO

/* =====================================================================
   (ไม่บังคับ) สร้างเก้าอี้ให้คนที่อยู่ตอนนี้ 1 คน = 1 เก้าอี้ แล้วผูก Seat_ID
   แอปยังไม่ได้จัดการเก้าอี้ — รันส่วนนี้เมื่อพร้อมเริ่มใช้เก้าอี้จริง (เอา comment ออก)

DECLARE @map TABLE (Seat_ID int, Member_ID int);
MERGE dbo.Org_Seat AS t
USING (SELECT m.Member_ID, m.Unit_ID, m.PositionID, m.is_manager, m.start_date, m.end_date
       FROM dbo.Org_Member m
       WHERE m.Actived = 1 AND m.Seat_ID IS NULL
         AND (m.end_date IS NULL OR m.end_date >= CAST(GETDATE() AS date))) AS s
ON 1 = 0
WHEN NOT MATCHED THEN
    INSERT (Unit_ID, PositionID, is_manager, valid_from, valid_to, CreateBy)
    VALUES (s.Unit_ID, s.PositionID, s.is_manager, s.start_date, s.end_date, '005_backfill')
OUTPUT inserted.Seat_ID, s.Member_ID INTO @map;

UPDATE m SET Seat_ID = x.Seat_ID, UpdateBy = '005_backfill', UpdateDate = GETDATE()
FROM dbo.Org_Member m JOIN @map x ON x.Member_ID = m.Member_ID;
*/
GO
SET NOEXEC OFF;
GO
