import type { LucideIcon } from "lucide-react";
import { LifeBuoyIcon, NetworkIcon, SendIcon } from "lucide-react";

/**
 * Nav config — แหล่งเดียวของ path และเมนูใน sidebar (shadcn sidebar-16)
 *
 * เพิ่มหน้าใหม่: ใส่ path ใน ROUTES → สร้าง app/<path>/page.tsx → เพิ่ม item ใน NAV_MAIN
 * breadcrumb ใน header สร้างจาก config นี้อัตโนมัติ
 */
export const ROUTES = {
  home: "/",
  admin: {
    root: "/c/admin",
    orgUnits: "/c/admin/org-units",
  },
} as const;

export type NavSubItem = { title: string; url: string };

export type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  /** เมนูย่อย — มีแล้วจะแสดงปุ่มพับ/กาง */
  items?: NavSubItem[];
};

export type NavProject = { name: string; url: string; icon: LucideIcon };

/** โลโก้/ชื่อแอป มุมบนของ sidebar */
export const SITE = {
  name: "OPS Hierarchy",
  subtitle: "ผังองค์กร",
  icon: NetworkIcon,
  home: ROUTES.admin.orgUnits,
} as const;

/** กลุ่มเมนูหลัก (label บนสุดของ sidebar) */
export const NAV_MAIN_LABEL = "ผู้ดูแลระบบ";

export const NAV_MAIN: NavItem[] = [
  {
    title: "ผังห้อง (Org Units)",
    url: ROUTES.admin.orgUnits,
    icon: NetworkIcon,
  },
];

/** กลุ่ม "Projects" ของ sidebar-16 — ว่างไว้ = ไม่แสดงกลุ่มนี้ */
export const NAV_PROJECTS_LABEL = "Projects";
export const NAV_PROJECTS: NavProject[] = [];

export const NAV_SECONDARY: NavItem[] = [];

/** label ของ segment ที่ไม่ใช่หน้า (ใช้ใน breadcrumb) */
const SEGMENT_LABELS: Record<string, string> = {
  [ROUTES.admin.root]: NAV_MAIN_LABEL,
};

/** url ตรงกับ pathname หรือเป็น parent ของ pathname */
export function isActivePath(pathname: string, url: string): boolean {
  if (!url || url === "#") return false;
  if (url === "/") return pathname === "/";
  return pathname === url || pathname.startsWith(url + "/");
}

function findTitle(url: string): string | undefined {
  for (const item of NAV_MAIN) {
    if (item.url === url) return item.title;
    const sub = item.items?.find((s) => s.url === url);
    if (sub) return sub.title;
  }
  return SEGMENT_LABELS[url];
}

export type Crumb = { title: string; url: string };

/** breadcrumb จาก pathname — เก็บเฉพาะ segment ที่มี title ใน config */
export function getBreadcrumbs(pathname: string): Crumb[] {
  const parts = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [];
  for (let i = 0; i < parts.length; i++) {
    const url = "/" + parts.slice(0, i + 1).join("/");
    const title = findTitle(url);
    if (title) crumbs.push({ title, url });
  }
  return crumbs;
}
