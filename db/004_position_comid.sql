/* =====================================================================
   004_position_comid : ตำแหน่ง (Position) แยกตามบริษัทได้

   Position.ComID
     NULL  = ตำแหน่งกลาง ใช้ได้ทุกบริษัท (แถวเดิมทั้งหมด -> ระบบเก่าที่อ่าน Users.PositionID ไม่กระทบ)
     ComID = ใช้ได้เฉพาะบริษัทนั้น
   rank_no ต้องมีความหมายเดียวกันทุกบริษัท (5 = MD/GM, 4 = FM, 3 = DM, 2 = SM, 1 = AM)

   กฎ (trigger):
     - Org_Member: ตำแหน่งต้องเป็นตำแหน่งกลาง หรือของบริษัทเดียวกับห้อง
     - Position  : เปลี่ยน ComID ไม่ได้ ถ้ายังมีคนในบริษัทอื่นใช้ตำแหน่งนี้อยู่ (ยังไม่จบ)

   รันซ้ำได้ (idempotent) · แยกหลาย batch เพราะ CREATE OR ALTER TRIGGER ต้องอยู่ต้น batch
   ===================================================================== */

/* 1) คอลัมน์ + FK ------------------------------------------------------ */
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH('dbo.Position', 'ComID') IS NULL
    ALTER TABLE dbo.Position ADD ComID int NULL;

COMMIT TRANSACTION;
GO

IF OBJECT_ID('dbo.FK_Position_Company', 'F') IS NULL
    ALTER TABLE dbo.Position ADD CONSTRAINT FK_Position_Company
        FOREIGN KEY (ComID) REFERENCES dbo.Company (ComID);
GO

/* 2) Org_Member: เพิ่มกฎข้อ 4 ------------------------------------------ */
CREATE OR ALTER TRIGGER dbo.trg_Org_Member_Check ON dbo.Org_Member AFTER INSERT, UPDATE
AS
/* ---------------------------------------------------------------------
   trg_Org_Member_Check : กฎข้ามแถว (ช่วงวันที่ห้ามทับกัน)
     1) ห้องหนึ่ง มีหัวหน้าได้ 1 คน ณ วันใดวันหนึ่ง
     2) คนหนึ่ง มีห้องหลักได้ 1 ห้อง ณ วันใดวันหนึ่ง
     3) คนหนึ่ง อยู่ห้องเดียวกันซ้อนช่วงวันที่กันไม่ได้
     4) ตำแหน่งต้องเป็นตำแหน่งกลาง (ComID NULL) หรือของบริษัทเดียวกับห้อง
   --------------------------------------------------------------------- */
BEGIN
    SET NOCOUNT ON;
    DECLARE @msg nvarchar(200);

    IF EXISTS (SELECT 1 FROM inserted i
               JOIN dbo.Position p  ON p.PositionID = i.PositionID
               JOIN dbo.Org_Unit un ON un.Unit_ID = i.Unit_ID
               WHERE i.Actived = 1 AND p.ComID IS NOT NULL AND p.ComID <> un.ComID)
    BEGIN
        RAISERROR (N'Org_Member: ตำแหน่งนี้เป็นของบริษัทอื่น ใช้กับห้องนี้ไม่ได้', 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END

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

/* 3) Position: ห้ามย้ายตำแหน่งไปบริษัทอื่นขณะที่ยังมีคนใช้ ---------------- */
CREATE OR ALTER TRIGGER dbo.trg_Position_Com ON dbo.Position AFTER UPDATE
AS
/* trg_Position_Com : ตั้ง ComID ได้เมื่อไม่มีสมาชิก (ยังไม่จบ) ของบริษัทอื่นใช้ตำแหน่งนี้
   ทำงานเฉพาะตอนแก้ ComID — ระบบเก่าที่แก้คอลัมน์อื่นไม่โดน */
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE(ComID) RETURN;

    DECLARE @code varchar(50);
    SELECT TOP 1 @code = i.PositionCode
    FROM inserted i
    JOIN dbo.Org_Member m ON m.PositionID = i.PositionID AND m.Actived = 1
     AND (m.end_date IS NULL OR m.end_date >= CAST(GETDATE() AS date))
    JOIN dbo.Org_Unit un ON un.Unit_ID = m.Unit_ID
    WHERE i.ComID IS NOT NULL AND un.ComID <> i.ComID;

    IF @code IS NOT NULL
    BEGIN
        RAISERROR (N'Position: ตำแหน่ง %s ยังมีคนในบริษัทอื่นใช้อยู่ — ย้ายหรือเปลี่ยนตำแหน่งคนเหล่านั้นก่อน', 16, 1, @code);
        ROLLBACK TRANSACTION;
    END
END
GO

/* 4) ตั้งตำแหน่งเฉพาะบริษัท — แก้ ComCode ให้ตรงแล้วเอา comment ออกก่อนรัน
      ตำแหน่งที่ไม่ได้ตั้ง = ตำแหน่งกลาง (FM / DM / SM)

UPDATE dbo.Position SET ComID = (SELECT ComID FROM dbo.Company WHERE ComCode = 'PURE')
WHERE PositionCode IN ('MD', 'AM');

UPDATE dbo.Position SET ComID = (SELECT ComID FROM dbo.Company WHERE ComCode = 'SCT')
WHERE PositionCode IN ('GM');

-- ตรวจผล
SELECT p.PositionCode, p.Position, p.rank_no, ISNULL(c.ComCode, N'(กลาง)') AS company
FROM dbo.Position p LEFT JOIN dbo.Company c ON c.ComID = p.ComID
WHERE p.is_active = 1
ORDER BY p.rank_no DESC, p.PositionCode;
*/
