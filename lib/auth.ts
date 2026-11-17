import "server-only";

export type CurrentUser = { UserID: number; UserCode: string };

/**
 * ผู้ใช้ที่ login อยู่ — null = ยังไม่ login
 *
 * ยังไม่มีระบบ login: ตอน dev fix เป็น TPD (UserID 102) เพื่อทดสอบการบันทึกผัง
 * ============================================================================
 *  DEV ONLY — ห้าม fix ผู้ใช้ตอนขึ้น prod  แทนส่วนนี้ด้วย session จริงก่อน deploy
 *  (ตอน NODE_ENV = "production" ฟังก์ชันนี้คืน null เสมอ = ไม่บันทึกอะไร)
 * ============================================================================
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (process.env.NODE_ENV !== "production") return { UserID: 102, UserCode: "TPD" };
  return null;
}
