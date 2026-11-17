// โครงสร้างเดียวกับ WEB_KPIs (lib/queries.ts) เพื่อให้ย้ายไปต่อ API จริงได้ง่าย

export type UserProfile = {
  UserID: number;
  UserCode: string;
  Name: string;
  DepID: number | null;
  depcode: string | null;
  depname: string | null;
  SecID: number | null;
  seccode: string | null;
  secname: string | null;
  PositionID: number | null;
  positioncode: string | null;
  positionname: string | null;
  Email: string;
  Tel: string | null;
  Actived: boolean;
  empUserID: number | null; // หัวหน้า (ผู้อนุมัติ)
  empUserCode: string;
  empName: string;
};

export type TeamMember = UserProfile & {
  kpi_plan_code: string;
  kpi_plan_id: number;
  com_id: number | null;
  com_code: string | null;
  com_name: string | null;
};

export type Policy = {
  evaluation_policy_id: number;
  title: string;
  evaluation_year: number;
};

export type OrgValues = {
  comId?: string;
  depId?: string;
  secId?: string;
  positionId?: string;
};

export type OrgItem = { id: number; code: string; name: string };
